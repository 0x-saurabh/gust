// Writes a one-action timelock plan (BuybackBurner.setKeeper) in the format safe-run.mjs reads.
//   node scripts/mainnet/setkeeper-plan.mjs 0xNewKeeper out.json
import fs from 'node:fs'
import { createPublicClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, parseAbi } from 'viem'

const [newKeeper, outFile] = process.argv.slice(2)
const CHAIN_ID = process.env.CHAIN_ID || '4663'
const dep = JSON.parse(fs.readFileSync(`contracts/deployments/${CHAIN_ID}.json`, 'utf8'))
const client = createPublicClient({ transport: http(process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com', { retryCount: 6, retryDelay: 1500 }) })
const abi = parseAbi([
  'function setKeeper(address keeper)',
  'function keeper() view returns (address)',
  'function getMinDelay() view returns (uint256)',
  'function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function execute(address target, uint256 value, bytes payload, bytes32 predecessor, bytes32 salt)',
])
const keeper = getAddress(newKeeper)
const [current, delay] = await Promise.all([
  client.readContract({ address: dep.buybackBurner, abi, functionName: 'keeper' }),
  client.readContract({ address: dep.timelock, abi, functionName: 'getMinDelay' }),
])
if (getAddress(current) === keeper) { console.log(`BuybackBurner keeper is already ${keeper}. Nothing to do.`); process.exit(3) }
const data = encodeFunctionData({ abi, functionName: 'setKeeper', args: [keeper] })
const salt = keccak256(encodeAbiParameters([{ type: 'string' }], [`kyte-setkeeper:${keeper}`]))
const ZERO = '0x' + '0'.repeat(64)
const label = `BuybackBurner.setKeeper ${keeper}`
const call = {
  label, target: getAddress(dep.buybackBurner), data, salt,
  schedule: encodeFunctionData({ abi, functionName: 'schedule', args: [dep.buybackBurner, 0n, data, ZERO, salt, delay] }),
  execute: encodeFunctionData({ abi, functionName: 'execute', args: [dep.buybackBurner, 0n, data, ZERO, salt] }),
}
fs.writeFileSync(outFile, JSON.stringify({ timelock: getAddress(dep.timelock), delay: Number(delay), calls: [call] }, null, 2))
console.log(`${label}: from ${current}, timelock delay ${delay}s. Plan written to ${outFile}`)
