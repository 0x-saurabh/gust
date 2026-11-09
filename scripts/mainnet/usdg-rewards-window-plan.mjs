// UsdgRewards.setClaimWindow through the timelock. Default: 1 day (86400 s), the contract minimum, so unclaimed USDG
// returns to the treasury (ops Safe) one day after each epoch is published.
//   node scripts/mainnet/usdg-rewards-window-plan.mjs            -> scripts/mainnet/out/usdg-rewards-window-plan-4663.json
//   PLAN_FILE=<that file> node scripts/mainnet/safe-run.mjs auto  (schedule, wait the timelock delay, execute)
// env: CLAIM_WINDOW (seconds, 86400..31536000), CHAIN_ID, RPC_URL, OUT_DIR
import fs from 'node:fs'
import { createPublicClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, parseAbi } from 'viem'

const CHAIN_ID = process.env.CHAIN_ID || '4663'
const RPC = process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const dep = JSON.parse(fs.readFileSync(`contracts/deployments/${CHAIN_ID}.json`, 'utf8'))
if (!dep.usdgRewards) throw new Error('deployments has no usdgRewards')
const WINDOW = BigInt(process.env.CLAIM_WINDOW || 86400)
if (WINDOW < 86400n || WINDOW > 31536000n) throw new Error('CLAIM_WINDOW must be 86400..31536000 seconds')
const OUT = process.env.OUT_DIR || 'scripts/mainnet/out'
const client = createPublicClient({ transport: http(RPC) })
const tlAbi = parseAbi(['function getMinDelay() view returns (uint256)', 'function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)', 'function execute(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt)'])
const rwAbi = parseAbi(['function claimWindow() view returns (uint64)', 'function setClaimWindow(uint64)'])
const ZERO32 = '0x' + '0'.repeat(64)
const tl = getAddress(dep.timelock), rw = getAddress(dep.usdgRewards)
const current = await client.readContract({ address: rw, abi: rwAbi, functionName: 'claimWindow' })
if (BigInt(current) === WINDOW) { console.log(`claimWindow already ${WINDOW}s: nothing to do`); process.exit(0) }
const delay = await client.readContract({ address: tl, abi: tlAbi, functionName: 'getMinDelay' })
const data = encodeFunctionData({ abi: rwAbi, functionName: 'setClaimWindow', args: [WINDOW] })
const salt = keccak256(encodeAbiParameters([{ type: 'string' }], [`usdg-rewards:setClaimWindow:${WINDOW}:${rw}`]))
const calls = [{ label: `UsdgRewards.setClaimWindow ${current}s -> ${WINDOW}s`, target: rw, data, salt,
  schedule: encodeFunctionData({ abi: tlAbi, functionName: 'schedule', args: [rw, 0n, data, ZERO32, salt, delay] }),
  execute: encodeFunctionData({ abi: tlAbi, functionName: 'execute', args: [rw, 0n, data, ZERO32, salt] }) }]
fs.mkdirSync(OUT, { recursive: true })
const f = `${OUT}/usdg-rewards-window-plan-${CHAIN_ID}.json`
fs.writeFileSync(f, JSON.stringify({ timelock: tl, delay: Number(delay), calls }, null, 2))
console.log(`1 timelock operation (delay ${delay}s)`); for (const c of calls) console.log('  ' + c.label); console.log(f)
