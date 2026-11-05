// Markets v3 timelock plan, in the format safe-run.mjs reads.
//
//   node scripts/mainnet/v3-plan.mjs record     # after DeployMarketsV3: add v3.fromBlock (L2) from the broadcast receipts
//   node scripts/mainnet/v3-plan.mjs plan       # write scripts/mainnet/out/v3-plan-1-4663.json, print its path
//
// v3 reuses the v2 AssetRegistry, so nothing is listed: the only timelock calls are callMarket.setRouter and
// putMarket.setRouter on the new markets (skipped if already set). The plan is cached so a re-run resumes the same
// timelock operations; delete scripts/mainnet/out/v3-plans-<chain>.json to recompute.
import fs from 'node:fs'
import { createPublicClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, parseAbi } from 'viem'

const MODE = process.argv[2] || 'plan'
const CHAIN_ID = process.env.CHAIN_ID || '4663'
const RPC = process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const DEP_FILE = process.env.DEP_FILE || `contracts/deployments/${CHAIN_ID}.json`
const OUT = process.env.OUT_DIR || 'scripts/mainnet/out'
const CACHE = `${OUT}/v3-plans-${CHAIN_ID}.json`
const dep = JSON.parse(fs.readFileSync(DEP_FILE, 'utf8'))
const client = createPublicClient({ transport: http(RPC, { retryCount: 6, retryDelay: 1500 }) })
const ZERO32 = '0x' + '0'.repeat(64)

if (MODE === 'record') {
  if (!dep.v3) throw new Error(`${DEP_FILE} has no v3 section: run DeployMarketsV3 first`)
  if (dep.v3.fromBlock) { console.log(`v3.fromBlock already set (${dep.v3.fromBlock})`); process.exit(0) }
  const run = JSON.parse(fs.readFileSync(`contracts/broadcast/DeployMarketsV3.s.sol/${CHAIN_ID}/run-latest.json`, 'utf8'))
  const addrs = new Set(Object.values(dep.v3).map((a) => String(a).toLowerCase()))
  const created = run.receipts.filter((r) => r.contractAddress && addrs.has(r.contractAddress.toLowerCase()))
  if (!created.length) throw new Error('broadcast receipts do not match the v3 addresses in the deployment file')
  dep.v3.fromBlock = Math.min(...run.receipts.map((r) => Number(r.blockNumber)))
  fs.writeFileSync(DEP_FILE, JSON.stringify(dep, null, 2) + '\n')
  console.log(`v3.fromBlock = ${dep.v3.fromBlock}`)
  process.exit(0)
}

if (!dep.v3?.callMarket) throw new Error(`${DEP_FILE} has no v3 section: run DeployMarketsV3 first`)
const abi = parseAbi([
  'function setRouter(address router)',
  'function router() view returns (address)',
  'function getMinDelay() view returns (uint256)',
  'function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function execute(address target, uint256 value, bytes payload, bytes32 predecessor, bytes32 salt)',
])
const read = (address, functionName, args = []) => client.readContract({ address, abi, functionName, args })

fs.mkdirSync(OUT, { recursive: true })
let plan
if (fs.existsSync(CACHE)) {
  plan = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
  if (plan.router !== getAddress(dep.v3.router)) throw new Error(`${CACHE} was made for router ${plan.router}: delete it`)
  console.log(`using cached plan ${CACHE} (${plan.calls.length} operations)`)
} else {
  const delay = await read(dep.timelock, 'getMinDelay')
  const calls = []
  for (const m of ['callMarket', 'putMarket']) {
    if (getAddress(await read(dep.v3[m], 'router')) === getAddress(dep.v3.router)) continue
    const data = encodeFunctionData({ abi, functionName: 'setRouter', args: [dep.v3.router] })
    const label = `${m}.setRouter ${dep.v3.router}`
    const salt = keccak256(encodeAbiParameters([{ type: 'string' }], [`kyte-v3:${label}`]))
    calls.push({
      label, target: getAddress(dep.v3[m]), data, salt,
      schedule: encodeFunctionData({ abi, functionName: 'schedule', args: [dep.v3[m], 0n, data, ZERO32, salt, delay] }),
      execute: encodeFunctionData({ abi, functionName: 'execute', args: [dep.v3[m], 0n, data, ZERO32, salt] }),
    })
  }
  plan = { router: getAddress(dep.v3.router), timelock: getAddress(dep.timelock), delay: Number(delay), calls }
  fs.writeFileSync(CACHE, JSON.stringify(plan, null, 2))
  console.log(`${calls.length} timelock operations, delay ${plan.delay}s`)
}
if (!plan.calls.length) { console.log('routers already set: nothing to schedule'); process.exit(0) }
const f = `${OUT}/v3-plan-1-${CHAIN_ID}.json`
fs.writeFileSync(f, JSON.stringify({ timelock: plan.timelock, delay: plan.delay, calls: plan.calls }, null, 2))
console.log(f)
