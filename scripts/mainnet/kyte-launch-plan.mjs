// $KYTE launch: deployment-file bookkeeping and the timelock plan, in the format safe-run.mjs reads.
//
//   node scripts/mainnet/kyte-launch-plan.mjs apply    # after DeployKyteLaunch: promote `launch` to the top level
//   node scripts/mainnet/kyte-launch-plan.mjs plan     # write scripts/mainnet/out/kyte-launch-plan-1-4663.json
//
// Timelock operations (each skipped when already in place):
//   feeVault.setDestinations(stakingPool, buybackBurner, opsSafe)   fees go to the new pool and burner
//   buybackBurner.setAdapter(swapAdapter)                           burner swaps on the live KYTE/WETH pool
//   buybackBurner.setBounds(maxPerCall, maxSlippageBps)             from the old burner, unless env overrides
//   assetRegistry.addAsset(kyte, cap, minStrike)                    $KYTE options tradeable (KYTE_CAP / KYTE_MIN_STRIKE,
//                                                                   defaults: the old token's listing)
//   assetRegistry.setPutsEnabled(kyte, true)                        only with KYTE_PUTS=1
// The plan is cached so a re-run resumes the same operations; delete scripts/mainnet/out/kyte-launch-plans-<chain>.json
// to recompute.
import fs from 'node:fs'
import { createPublicClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, parseAbi } from 'viem'

const MODE = process.argv[2] || 'plan'
const CHAIN_ID = process.env.CHAIN_ID || '4663'
const RPC = process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const DEP_FILE = process.env.DEP_FILE || `contracts/deployments/${CHAIN_ID}.json`
const OUT = process.env.OUT_DIR || 'scripts/mainnet/out'
const CACHE = `${OUT}/kyte-launch-plans-${CHAIN_ID}.json`
const dep = JSON.parse(fs.readFileSync(DEP_FILE, 'utf8'))
const client = createPublicClient({ transport: http(RPC, { retryCount: 6, retryDelay: 1500 }) })
const ZERO32 = '0x' + '0'.repeat(64)
const same = (a, b) => a && b && getAddress(a) === getAddress(b)

if (MODE === 'apply') {
  if (!dep.launch?.kyteToken) throw new Error(`${DEP_FILE} has no launch section: run DeployKyteLaunch first`)
  if (same(dep.kyteToken, dep.launch.kyteToken)) { console.log('launch already applied'); process.exit(0) }
  // Keep the test-token set for the record; the old pool stays claimable for whoever staked there.
  dep.legacyKyte = { kyteToken: dep.kyteToken, stakingPool: dep.stakingPool, buybackBurner: dep.buybackBurner, swapAdapter: dep.swapAdapter, pool: dep.pools?.KYTE }
  dep.kyteToken = dep.launch.kyteToken
  dep.stakingPool = dep.launch.stakingPool
  dep.buybackBurner = dep.launch.buybackBurner
  delete dep.swapAdapter // DeployAdapter writes the live pool's adapter and pools.KYTE
  if (dep.pools?.KYTE) delete dep.pools.KYTE
  if (dep.tokens) dep.tokens.KYTE = dep.launch.kyteToken
  fs.writeFileSync(DEP_FILE, JSON.stringify(dep, null, 2) + '\n')
  console.log(`kyteToken = ${dep.kyteToken}\nstakingPool = ${dep.stakingPool}\nbuybackBurner = ${dep.buybackBurner}`)
  process.exit(0)
}

if (!dep.launch?.kyteToken || !same(dep.kyteToken, dep.launch.kyteToken)) throw new Error('run `apply` first')
if (!dep.swapAdapter) throw new Error('no swapAdapter: run DeployAdapter.s.sol (live KYTE/WETH pool) first')
const abi = parseAbi([
  'function setDestinations(address stakingPool_, address buybackBurner_, address opsSafe_)',
  'function stakingPool() view returns (address)',
  'function buybackBurner() view returns (address)',
  'function setAdapter(address adapter_)',
  'function adapter() view returns (address)',
  'function setBounds(uint256 maxPerCall_, uint256 maxSlippageBps_)',
  'function maxPerCall() view returns (uint256)',
  'function maxSlippageBps() view returns (uint256)',
  'function addAsset(address token, uint256 cap_, uint256 minStrike_)',
  'function setPutsEnabled(address token, bool enabled)',
  'function getAsset(address token) view returns ((bool listed, bool enabled, bool putsEnabled, uint8 decimals, uint256 cap, uint256 minStrike))',
  'function getMinDelay() view returns (uint256)',
  'function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function execute(address target, uint256 value, bytes payload, bytes32 predecessor, bytes32 salt)',
])
const read = (address, functionName, args = []) => client.readContract({ address, abi, functionName, args })
const registry = dep.v3?.assetRegistry || dep.v2?.assetRegistry || dep.assetRegistry

fs.mkdirSync(OUT, { recursive: true })
let plan
if (fs.existsSync(CACHE)) {
  plan = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
  if (!same(plan.kyteToken, dep.kyteToken)) throw new Error(`${CACHE} was made for ${plan.kyteToken}: delete it`)
  console.log(`using cached plan ${CACHE} (${plan.calls.length} operations)`)
} else {
  const delay = await read(dep.timelock, 'getMinDelay')
  const calls = []
  const op = (label, target, data) => {
    const salt = keccak256(encodeAbiParameters([{ type: 'string' }], [`kyte-launch:${label}`]))
    calls.push({
      label, target: getAddress(target), data, salt,
      schedule: encodeFunctionData({ abi, functionName: 'schedule', args: [target, 0n, data, ZERO32, salt, delay] }),
      execute: encodeFunctionData({ abi, functionName: 'execute', args: [target, 0n, data, ZERO32, salt] }),
    })
  }
  if (!same(await read(dep.feeVault, 'stakingPool'), dep.stakingPool) || !same(await read(dep.feeVault, 'buybackBurner'), dep.buybackBurner)) {
    op(`feeVault.setDestinations ${dep.stakingPool} ${dep.buybackBurner}`, dep.feeVault,
      encodeFunctionData({ abi, functionName: 'setDestinations', args: [dep.stakingPool, dep.buybackBurner, dep.opsSafe] }))
  }
  if (!same(await read(dep.buybackBurner, 'adapter'), dep.swapAdapter)) {
    op(`buybackBurner.setAdapter ${dep.swapAdapter}`, dep.buybackBurner, encodeFunctionData({ abi, functionName: 'setAdapter', args: [dep.swapAdapter] }))
  }
  // Bounds: env overrides, else copied from the old burner; with neither, the contract defaults stay.
  const old = dep.legacyKyte?.buybackBurner
  if (process.env.MAX_PER_CALL || process.env.MAX_SLIPPAGE_BPS || old) {
    const maxPerCall = process.env.MAX_PER_CALL ? BigInt(process.env.MAX_PER_CALL) : await read(old ?? dep.buybackBurner, 'maxPerCall')
    const maxSlippage = process.env.MAX_SLIPPAGE_BPS ? BigInt(process.env.MAX_SLIPPAGE_BPS) : await read(old ?? dep.buybackBurner, 'maxSlippageBps')
    if ((await read(dep.buybackBurner, 'maxPerCall')) !== maxPerCall || (await read(dep.buybackBurner, 'maxSlippageBps')) !== maxSlippage) {
      op(`buybackBurner.setBounds ${maxPerCall} ${maxSlippage}`, dep.buybackBurner, encodeFunctionData({ abi, functionName: 'setBounds', args: [maxPerCall, maxSlippage] }))
    }
  }
  const listing = await read(registry, 'getAsset', [dep.kyteToken])
  if (!listing.listed) {
    const oldListing = dep.legacyKyte?.kyteToken ? await read(registry, 'getAsset', [dep.legacyKyte.kyteToken]) : null
    const cap = process.env.KYTE_CAP ? BigInt(process.env.KYTE_CAP) : oldListing?.cap
    const minStrike = process.env.KYTE_MIN_STRIKE ? BigInt(process.env.KYTE_MIN_STRIKE) : oldListing?.minStrike
    if (cap === undefined || minStrike === undefined) throw new Error('set KYTE_CAP and KYTE_MIN_STRIKE (raw units): no old listing to copy from')
    op(`assetRegistry.addAsset ${dep.kyteToken} cap=${cap} minStrike=${minStrike}`, registry,
      encodeFunctionData({ abi, functionName: 'addAsset', args: [dep.kyteToken, cap, minStrike] }))
  }
  if (process.env.KYTE_PUTS === '1' && !listing.putsEnabled) {
    op(`assetRegistry.setPutsEnabled ${dep.kyteToken} true`, registry, encodeFunctionData({ abi, functionName: 'setPutsEnabled', args: [dep.kyteToken, true] }))
  }
  plan = { kyteToken: getAddress(dep.kyteToken), timelock: getAddress(dep.timelock), delay: Number(delay), calls }
  fs.writeFileSync(CACHE, JSON.stringify(plan, null, 2))
  console.log(`${calls.length} timelock operations, delay ${plan.delay}s`)
  for (const c of calls) console.log(`  ${c.label}`)
}
if (!plan.calls.length) { console.log('everything already in place: nothing to schedule'); process.exit(0) }
const f = `${OUT}/kyte-launch-plan-1-${CHAIN_ID}.json`
fs.writeFileSync(f, JSON.stringify({ timelock: plan.timelock, delay: plan.delay, calls: plan.calls }, null, 2))
console.log(f)
