// Disables listed tokens through the guardian Safe, in ONE Safe transaction (MultiSendCallOnly).
// Disabling is guardian-only and instant (no timelock); it blocks NEW offers for the token. Open positions are
// untouched: they can still be bought, exercised, cancelled and expired. Re-enabling needs the timelock.
//
//   node scripts/mainnet/guardian-disable.mjs --dry            # what would be disabled + simulation, sends nothing
//   node scripts/mainnet/guardian-disable.mjs                  # sign (one owner) + send (deployer pays gas)
//   node scripts/mainnet/guardian-disable.mjs 0xToken 0xToken  # other tokens than the default list
//   node scripts/mainnet/guardian-disable.mjs --ondo [--dry]   # the Ondo Tokenized stocks (…on), Robinhood Stock Tokens stay
//
// Default list: the bridged tokens (cbBTC, LINK, VIRTUAL, PENGU), so only Robinhood Chain native tokens stay.
// Every registry in the deployment (v1 and, when deployed, v2) is covered in the same Safe transaction: the site lists
// from v2, but v1's markets would otherwise still take new offers on a token.
// env (scripts/mainnet/.env): GUARDIAN, OWNERS (keystore names, default owner1), SENDER (default deployer), RPC_URL.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { concatHex, createPublicClient, encodeFunctionData, encodePacked, getAddress, http, parseAbi, recoverAddress, size } from 'viem'

const env = (() => {
  const f = 'scripts/mainnet/.env'
  const o = {}
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=([^\s#]*)/); if (m) o[m[1]] = m[2] }
  return { ...o, ...process.env }
})()
const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const CHAIN_ID = env.CHAIN_ID || '4663'
const RPC = env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const dep = JSON.parse(fs.readFileSync(`contracts/deployments/${CHAIN_ID}.json`, 'utf8'))
const SAFE = getAddress(env.GUARDIAN || dep.guardian)
const REGISTRIES = [dep.assetRegistry, dep.v2?.assetRegistry].filter(Boolean).map((a) => getAddress(a))
const OWNERS = (env.OWNERS || 'owner1').split(',')
const SENDER = env.SENDER || 'deployer'
const CAST = `${os.homedir()}/.foundry/bin/cast`
const MULTISEND = '0x9641d764fc13c8B624c04430C7356C1C7C8102e2' // MultiSendCallOnly v1.4.1
const ZERO = '0x0000000000000000000000000000000000000000'
const BRIDGED = [
  '0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4', // cbBTC
  '0x492641F648a4986844848E0beFE66D14817bCE34', // LINK
  '0xc6911796042b15d7Fa4F6CDe69e245DdCd3d9c31', // VIRTUAL
  '0x74BE72AFFAFbC8de30F0C11247814036314D625f', // PENGU
]
const ONDO = [
  '0x9Bf86418CaF2b7a939603d6c24219a77Bf7F9b33', // AAPLon
  '0x369C4748E98C153e9B7aDeBc3E71e9e2a5f60Dc0', // CRCLon
  '0xe10cc5f0cd0C90322ebEB33e7757B2c9090146DC', // GOOGLon
  '0x43Cac729218C62210D71D66B7F0eC93990D8d8cc', // HOODon
  '0x7b5026cfcB4De0cF3d9a39FE2A541514b71437A2', // METAon
  '0x09dedC334fC47ab543e5D70C7FD9D2B1aea175bd', // MSTRon
  '0xf1b95AE4E7700b962714702EA53784Dc8492a856', // NVDAon
  '0x300fE8a40701cE81460503fB886f9eD81A3B5e14', // QQQon
  '0x9B8294F24453379aa87C807ab82bf1d5722153Fc', // SPCXon
  '0x533C5571ae586985E1FDDFAa24304284d970C62a', // SPYon
  '0xB197F36C25BA9b66960688882A4dC595C6b04309', // TSLAon
]
const explicit = args.filter((a) => a.startsWith('0x'))
const tokens = (explicit.length ? explicit : args.includes('--ondo') ? ONDO : BRIDGED).map((a) => getAddress(a.toLowerCase()))

const client = createPublicClient({ transport: http(RPC, { retryCount: 6, retryDelay: 2000 }) })
const safeAbi = parseAbi([
  'function nonce() view returns (uint256)',
  'function getThreshold() view returns (uint256)',
  'function getOwners() view returns (address[])',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)',
])
const regAbi = parseAbi([
  'function setEnabled(address token, bool enabled)',
  'function getAsset(address token) view returns ((bool listed, bool enabled, bool putsEnabled, uint8 decimals, uint256 cap, uint256 minStrike))',
])
const ercAbi = parseAbi(['function symbol() view returns (string)'])
const cast = (a, capture = true) => execFileSync(CAST, a, { stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'] })?.toString().trim()

async function main() {
  const todo = []
  for (const [i, registry] of REGISTRIES.entries()) {
    const tag = REGISTRIES.length > 1 ? `v${i + 1}` : 'registry'
    for (const t of tokens) {
      const [a, sym] = await Promise.all([
        client.readContract({ address: registry, abi: regAbi, functionName: 'getAsset', args: [t] }),
        client.readContract({ address: t, abi: ercAbi, functionName: 'symbol' }).catch(() => '?'),
      ])
      if (!a.listed) console.log(`skip ${tag} ${sym} ${t}: not listed`)
      else if (!a.enabled) console.log(`skip ${tag} ${sym} ${t}: already disabled`)
      else todo.push({ registry, tag, token: t, sym, data: encodeFunctionData({ abi: regAbi, functionName: 'setEnabled', args: [t, false] }) })
    }
  }
  if (!todo.length) return console.log('nothing to disable.')
  console.log(`guardian Safe ${SAFE} will disable: ${todo.map((x) => `${x.sym} (${x.tag})`).join(', ')}`)
  // Each inner call must succeed when sent by the guardian Safe.
  for (const x of todo) await client.call({ account: SAFE, to: x.registry, data: x.data })
  console.log('simulation ok (each setEnabled(false) as the guardian).')
  if (DRY) return console.log('--dry: nothing sent.')

  const [nonce, threshold, owners] = await Promise.all(['nonce', 'getThreshold', 'getOwners'].map((f) => client.readContract({ address: SAFE, abi: safeAbi, functionName: f })))
  const packed = concatHex(todo.map((x) => encodePacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [0, x.registry, 0n, BigInt(size(x.data)), x.data])))
  const msData = encodeFunctionData({ abi: parseAbi(['function multiSend(bytes transactions) payable']), functionName: 'multiSend', args: [packed] })
  const txArgs = [MULTISEND, 0n, msData, 1, 0n, 0n, 0n, ZERO, ZERO]
  const hash = await client.readContract({ address: SAFE, abi: safeAbi, functionName: 'getTransactionHash', args: [...txArgs, nonce] })
  const sigs = []
  for (const name of OWNERS.slice(0, Number(threshold))) {
    console.log(`\nsign with keystore "${name}" (enter its password):`)
    const sig = cast(['wallet', 'sign', '--no-hash', hash, '--account', name])
    const signer = await recoverAddress({ hash, signature: sig })
    if (!owners.map((o) => o.toLowerCase()).includes(signer.toLowerCase())) throw new Error(`keystore "${name}" is ${signer}, not an owner of ${SAFE}`)
    sigs.push({ signer, sig })
  }
  if (sigs.length < Number(threshold)) throw new Error(`needs ${threshold} signatures: set OWNERS=owner1,owner2`)
  sigs.sort((x, y) => (BigInt(x.signer) < BigInt(y.signer) ? -1 : 1))
  const call = encodeFunctionData({ abi: safeAbi, functionName: 'execTransaction', args: [...txArgs, concatHex(sigs.map((x) => x.sig))] })
  await client.call({ to: SAFE, data: call })
  console.log(`\nSafe simulation ok. Sending (keystore "${SENDER}" pays the gas, enter its password):`)
  cast(['send', SAFE, call, '--rpc-url', RPC, '--account', SENDER], false)
  for (const x of todo) {
    const a = await client.readContract({ address: x.registry, abi: regAbi, functionName: 'getAsset', args: [x.token] })
    console.log(`${x.sym} (${x.tag}): ${a.enabled ? 'STILL ENABLED' : 'disabled'}`)
  }
}

main().catch((e) => { console.error('\nfailed:', e.shortMessage ?? e.message); process.exit(1) })
