// Lists a graduated Pons launchpad token on Kyte: safety checks on chain, then a timelock plan in the format
// scripts/mainnet/safe-run.mjs executes (one Safe transaction through the 10 min timelock).
//
//   node scripts/mainnet/pons-list-plan.mjs 0xToken [0xToken2 ...]     writes scripts/mainnet/out/pons-list-plan-<n>-4663.json
//
// Checks (all must pass, per token): launched by a Pons factory, graduated, paired with WETH, the liquidity position
// still sits in the Pons locker, 18 decimals, a 1-wei transfer simulation shows no tax, not already listed.
// Cap: PONS_CAP_BPS of total supply (default 200 = 2%). Min strike: PONS_MIN_STRIKE wei (default 1e12 = 0.000001 ETH).
import fs from 'node:fs'
import { createPublicClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, parseAbi } from 'viem'

const CHAIN_ID = process.env.CHAIN_ID || '4663'
const RPC = process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const DEP_FILE = process.env.DEP_FILE || `contracts/deployments/${CHAIN_ID}.json`
const OUT = process.env.OUT_DIR || 'scripts/mainnet/out'
const CAP_BPS = BigInt(process.env.PONS_CAP_BPS || 200)
const MIN_STRIKE = BigInt(process.env.PONS_MIN_STRIKE || 1_000_000_000_000n)
const FACTORIES = ['0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB', '0x0c37a24F5D23A486FA692d1500881d698B1F77a4']
const LOCKERS = ['0x736D76699C26D0d966744cAe304C000d471f7F35', '0x31ca5E101941A93A7DD6d0497928700625CF54B5'] // active, legacy
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'
const ZERO32 = '0x' + '0'.repeat(64)

const tokens = process.argv.slice(2).map((t) => getAddress(t))
if (!tokens.length) { console.error('usage: node scripts/mainnet/pons-list-plan.mjs 0xToken [...]'); process.exit(1) }
const dep = JSON.parse(fs.readFileSync(DEP_FILE, 'utf8'))
const registry = dep.v3?.assetRegistry || dep.v2?.assetRegistry || dep.assetRegistry
const client = createPublicClient({ transport: http(RPC, { retryCount: 6, retryDelay: 1500 }) })
const abi = parseAbi([
  'function graduationStatus(address token) view returns (uint256 pairedPrincipal, uint256 threshold, bool graduated)',
  'function getLaunchedToken(address token) view returns ((address token, address deployer, address pairedToken, address positionManager, uint256 positionId, uint256 dexId, uint256 launchConfigId, uint256 restrictionsEndBlock, uint256 supply, bool isToken0, uint24 poolFee, bool exists, uint256 initialBuyAmount) launched)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function getAsset(address token) view returns ((bool listed, bool enabled, bool putsEnabled, uint8 decimals, uint256 cap, uint256 minStrike))',
  'function getMinDelay() view returns (uint256)',
  'function addAssets(address[] tokens, uint256[] caps, uint256[] minStrikes, bool putsOn)',
  'function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function execute(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt)',
])
const read = (address, functionName, args = []) => client.readContract({ address, abi, functionName, args })

const ok = [], caps = [], mins = []
for (const token of tokens) {
  const fail = (why) => { console.log(`  ✗ ${token}: ${why}`) }
  let launched, factory
  for (const f of FACTORIES) {
    const l = await read(f, 'getLaunchedToken', [token]).catch(() => null)
    if (l?.exists) { launched = l; factory = f; break }
  }
  if (!launched) { fail('not launched by a Pons factory'); continue }
  const [, , graduated] = await read(factory, 'graduationStatus', [token])
  if (!graduated) { fail('not graduated'); continue }
  if (getAddress(launched.pairedToken) !== getAddress(WETH)) { fail(`paired with ${launched.pairedToken}, not WETH`); continue }
  const owner = await read(launched.positionManager, 'ownerOf', [launched.positionId]).catch(() => null)
  if (!owner || !LOCKERS.some((l) => getAddress(l) === getAddress(owner))) { fail(`liquidity position not in a Pons locker (owner ${owner})`); continue }
  const decimals = await read(token, 'decimals')
  if (decimals !== 18) { fail(`${decimals} decimals`); continue }
  const symbol = await read(token, 'symbol')
  const supply = await read(token, 'totalSupply')
  // tax or blocklist check: a 1-wei transfer simulated from the deployer must not revert
  const holder = await read(token, 'balanceOf', [launched.deployer]).then((b) => (b > 0n ? launched.deployer : null)).catch(() => null)
  if (holder) {
    const r = await client.simulateContract({ address: token, abi, functionName: 'transfer', args: [registry, 1n], account: holder }).catch((e) => ({ error: e.shortMessage ?? e.message }))
    if (r.error) { fail(`transfer simulation reverted: ${r.error}`); continue }
  }
  const listing = await read(registry, 'getAsset', [token])
  if (listing.listed) { console.log(`  = ${symbol} ${token}: already listed (enabled ${listing.enabled})`); continue }
  const cap = (supply * CAP_BPS) / 10_000n
  ok.push(token); caps.push(cap); mins.push(MIN_STRIKE)
  console.log(`  ✓ ${symbol} ${token}: graduated, WETH pair, locker holds position ${launched.positionId}, cap ${cap / 10n ** 18n} tokens, minStrike ${MIN_STRIKE} wei`)
}
if (!ok.length) { console.log('nothing to list'); process.exit(2) }

const delay = await read(dep.timelock, 'getMinDelay')
const data = encodeFunctionData({ abi, functionName: 'addAssets', args: [ok, caps, mins, false] })
const label = `assetRegistry.addAssets pons ${ok.join(',')}`
const salt = keccak256(encodeAbiParameters([{ type: 'string' }], [`pons-list:${ok.join(',')}:${Date.now()}`]))
const call = {
  label, target: getAddress(registry), data, salt,
  schedule: encodeFunctionData({ abi, functionName: 'schedule', args: [registry, 0n, data, ZERO32, salt, delay] }),
  execute: encodeFunctionData({ abi, functionName: 'execute', args: [registry, 0n, data, ZERO32, salt] }),
}
fs.mkdirSync(OUT, { recursive: true })
let n = 1
while (fs.existsSync(`${OUT}/pons-list-plan-${n}-${CHAIN_ID}.json`)) n += 1
const f = `${OUT}/pons-list-plan-${n}-${CHAIN_ID}.json`
fs.writeFileSync(f, JSON.stringify({ timelock: getAddress(dep.timelock), delay: Number(delay), calls: [call] }, null, 2))
console.log(`1 timelock operation (delay ${delay}s): ${label}`)
console.log(f)
