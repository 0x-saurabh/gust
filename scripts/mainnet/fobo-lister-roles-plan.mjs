// After `forge script DeployFoboLister` writes foboLister into contracts/deployments/4663.json, this builds the ONE
// timelock operation (two grantRole calls batched as separate ops) that lets the lister schedule and execute listings.
//   node scripts/mainnet/fobo-lister-roles-plan.mjs        -> scripts/mainnet/out/fobo-lister-roles-plan-1-4663.json
//   PLAN_FILE=<that file> node scripts/mainnet/safe-run.mjs auto
import fs from 'node:fs'
import { createPublicClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, parseAbi, toHex } from 'viem'

const CHAIN_ID = process.env.CHAIN_ID || '4663'
const RPC = process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const dep = JSON.parse(fs.readFileSync(`contracts/deployments/${CHAIN_ID}.json`, 'utf8'))
if (!dep.foboLister) throw new Error('deployments has no foboLister: deploy it first (forge script script/DeployFoboLister.s.sol)')
const OUT = process.env.OUT_DIR || 'scripts/mainnet/out'
const client = createPublicClient({ transport: http(RPC) })
const abi = parseAbi([
  'function getMinDelay() view returns (uint256)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function execute(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt)',
])
const ZERO32 = '0x' + '0'.repeat(64)
const tl = getAddress(dep.timelock), lister = getAddress(dep.foboLister)
const delay = await client.readContract({ address: tl, abi, functionName: 'getMinDelay' })
const calls = []
for (const name of ['PROPOSER_ROLE', 'EXECUTOR_ROLE']) {
  const role = keccak256(toHex(name))
  if (await client.readContract({ address: tl, abi, functionName: 'hasRole', args: [role, lister] })) { console.log(`${name}: already granted`); continue }
  const data = encodeFunctionData({ abi, functionName: 'grantRole', args: [role, lister] })
  const salt = keccak256(encodeAbiParameters([{ type: 'string' }], [`fobo-lister:${name}:${lister}`]))
  calls.push({ label: `timelock.grantRole ${name} -> FoboLister ${lister}`, target: tl, data, salt,
    schedule: encodeFunctionData({ abi, functionName: 'schedule', args: [tl, 0n, data, ZERO32, salt, delay] }),
    execute: encodeFunctionData({ abi, functionName: 'execute', args: [tl, 0n, data, ZERO32, salt] }) })
}
if (!calls.length) { console.log('nothing to do'); process.exit(0) }
fs.mkdirSync(OUT, { recursive: true })
const f = `${OUT}/fobo-lister-roles-plan-1-${CHAIN_ID}.json`
fs.writeFileSync(f, JSON.stringify({ timelock: tl, delay: Number(delay), calls }, null, 2))
console.log(`${calls.length} timelock operations (delay ${delay}s)`); for (const c of calls) console.log('  ' + c.label); console.log(f)
