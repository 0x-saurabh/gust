// Prints the post-deploy wiring as Safe transactions (to, value, data) for the admin Safe to schedule on the
// TimelockController and execute 48 hours later. Reads contracts/deployments/<CHAIN_ID>.json and scripts/mainnet/.env.
//   node scripts/mainnet/timelock-calldata.mjs            env: CHAIN_ID (4663), ASSETS (optional, see below)
//   ASSETS="0xToken:cap:minStrike:puts,..."   cap and minStrike in raw units / wei; puts = 1 or 0
import fs from 'node:fs'
import { createPublicClient, http, encodeFunctionData, keccak256, encodeAbiParameters, parseAbi } from 'viem'

const CHAIN_ID = process.env.CHAIN_ID || '4663'
const dep = JSON.parse(fs.readFileSync(`contracts/deployments/${CHAIN_ID}.json`, 'utf8'))
const envFile = fs.existsSync('scripts/mainnet/.env') ? Object.fromEntries(fs.readFileSync('scripts/mainnet/.env', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.replace(/\s+#.*$/, '').split('=').map((s) => s.trim()))) : {}
const ops = dep.opsSafe || envFile.OPS_SAFE
const timelock = dep.timelock || envFile.TIMELOCK
if (!timelock) { console.error(`no timelock in contracts/deployments/${CHAIN_ID}.json (devnet has none: its admin is a plain account). Set TIMELOCK in scripts/mainnet/.env or run Deploy.s.sol first.`); process.exit(1) }
// Schedule with the timelock's real minimum delay (read on chain), so a short-delay timelock isn't scheduled for 48 h.
const RPCS = { 4663: 'https://rpc.mainnet.chain.robinhood.com', 46630: 'https://rpc.testnet.chain.robinhood.com', 31337: 'http://127.0.0.1:8547' }
const rpc = process.env.RPC_URL?.startsWith('http') ? process.env.RPC_URL : RPCS[CHAIN_ID]
let delay = Number(envFile.TIMELOCK_DELAY || 172800)
try {
  delay = Number(await createPublicClient({ transport: http(rpc) }).readContract({ address: timelock, abi: parseAbi(['function getMinDelay() view returns (uint256)']), functionName: 'getMinDelay' }))
} catch (e) {
  console.error(`note: couldn't read getMinDelay() from ${rpc} (${e.shortMessage || e.message}); using ${delay}s`)
}
const maxPerCall = process.env.BUYBACK_MAX_PER_CALL_WEI || '1000000000000000000' // 1 WETH per buyback call
const slippageBps = process.env.BUYBACK_SLIPPAGE_BPS || '500'

const abi = parseAbi([
  'function setDestinations(address stakingPool, address buybackBurner, address opsSafe)',
  'function setRouter(address router)',
  'function setAdapter(address adapter)',
  'function setBounds(uint256 maxPerCall, uint256 maxSlippageBps)',
  'function addAsset(address token, uint256 cap, uint256 minStrike)',
  'function setPutsEnabled(address token, bool enabled)',
  'function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function execute(address target, uint256 value, bytes payload, bytes32 predecessor, bytes32 salt)',
])

const calls = [
  ['FeeVault.setDestinations', dep.feeVault, encodeFunctionData({ abi, functionName: 'setDestinations', args: [dep.stakingPool, dep.buybackBurner, ops] })],
  ['CallMarket.setRouter', dep.callMarket, encodeFunctionData({ abi, functionName: 'setRouter', args: [dep.router] })],
  ['PutMarket.setRouter', dep.putMarket, encodeFunctionData({ abi, functionName: 'setRouter', args: [dep.router] })],
]
if (dep.swapAdapter && dep.swapAdapter !== '0x0000000000000000000000000000000000000000') {
  calls.push(['BuybackBurner.setAdapter', dep.buybackBurner, encodeFunctionData({ abi, functionName: 'setAdapter', args: [dep.swapAdapter] })])
  calls.push(['BuybackBurner.setBounds', dep.buybackBurner, encodeFunctionData({ abi, functionName: 'setBounds', args: [BigInt(maxPerCall), BigInt(slippageBps)] })])
} else console.error('note: no swapAdapter in the deployment file yet; run scripts/mainnet/deploy.sh adapter, then re-run this')
for (const a of (process.env.ASSETS || '').split(',').filter(Boolean)) {
  const [token, cap, minStrike, puts] = a.split(':')
  calls.push([`AssetRegistry.addAsset ${token}`, dep.assetRegistry, encodeFunctionData({ abi, functionName: 'addAsset', args: [token, BigInt(cap), BigInt(minStrike)] })])
  if (puts === '1') calls.push([`AssetRegistry.setPutsEnabled ${token}`, dep.assetRegistry, encodeFunctionData({ abi, functionName: 'setPutsEnabled', args: [token, true] })])
}

const ZERO = '0x' + '0'.repeat(64)
const salt = (label) => keccak256(encodeAbiParameters([{ type: 'string' }], [`kyte-launch:${label}`]))
console.log(`Timelock: ${timelock}\nDelay: ${delay}s (${delay / 3600} h)\n`)
console.log('== 1. From the admin Safe, send these to the Timelock (schedule). Safe Transaction Builder: to = timelock, value = 0, data = below.')
const scheduled = calls.map(([label, target, data]) => ({ label, target, data, salt: salt(label), schedule: encodeFunctionData({ abi, functionName: 'schedule', args: [target, 0n, data, ZERO, salt(label), BigInt(delay)] }), execute: encodeFunctionData({ abi, functionName: 'execute', args: [target, 0n, data, ZERO, salt(label)] }) }))
for (const c of scheduled) console.log(`\n# ${c.label}\n  to: ${timelock}\n  data: ${c.schedule}`)
console.log('\n\n== 2. After the delay, from the same Safe (execute):')
for (const c of scheduled) console.log(`\n# ${c.label}\n  to: ${timelock}\n  data: ${c.execute}`)
fs.mkdirSync('scripts/mainnet/out', { recursive: true })
fs.writeFileSync(`scripts/mainnet/out/timelock-${CHAIN_ID}.json`, JSON.stringify({ timelock, delay, calls: scheduled }, null, 2))
console.log(`\nsaved scripts/mainnet/out/timelock-${CHAIN_ID}.json`)
