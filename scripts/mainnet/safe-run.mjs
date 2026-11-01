// Runs the timelock wiring through the admin Safe from the command line: no Safe app, no file uploads.
// Bundles every action into ONE Safe transaction (MultiSendCallOnly), collects owner signatures from Foundry
// keystores, and submits it.
//
//   node scripts/mainnet/safe-run.mjs schedule   # today: queue the 7 actions in the 48 h timelock
//   node scripts/mainnet/safe-run.mjs execute    # after 48 h: run them (tells you how long to wait if early)
//   node scripts/mainnet/safe-run.mjs status     # what is queued / ready / done
//   node scripts/mainnet/safe-run.mjs auto       # everything: all passwords up front, schedule, wait 48 h, execute
//
// One-time setup, in the Terminal app (each asks for that wallet's key, then a password):
//   ~/.foundry/bin/cast wallet import owner1 --interactive
//   ~/.foundry/bin/cast wallet import owner2 --interactive
// You then only type passwords: one per owner (to sign) and the deployer's (to pay the gas).
//
// env: SAFE (admin Safe), OWNERS (keystore names, default owner1,owner2), SENDER (keystore paying gas, default
//      deployer), CHAIN_ID (4663), RPC_URL. Test-only: KEYSTORE_DIR + KEYSTORE_PASSWORD, SEND_UNLOCKED_FROM.
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
const MODE = process.argv[2] || 'status'
const CHAIN_ID = env.CHAIN_ID || '4663'
const RPC = env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const SAFE = getAddress(env.SAFE || env.ADMIN_SAFE)
const OWNERS = (env.OWNERS || 'owner1,owner2').split(',')
const SENDER = env.SENDER || 'deployer'
const CAST = `${os.homedir()}/.foundry/bin/cast`
const MULTISEND = '0x9641d764fc13c8B624c04430C7356C1C7C8102e2' // MultiSendCallOnly v1.4.1
const ZERO = '0x0000000000000000000000000000000000000000'
// PLAN_FILE runs a different action list through the same flow (e.g. scripts/mainnet/set-keeper.sh).
const plan = JSON.parse(fs.readFileSync(env.PLAN_FILE || `scripts/mainnet/out/timelock-${CHAIN_ID}.json`, 'utf8'))
const TL = getAddress(plan.timelock)

const client = createPublicClient({ transport: http(RPC, { retryCount: 6, retryDelay: 2000 }) })
const safeAbi = parseAbi([
  'function nonce() view returns (uint256)',
  'function getThreshold() view returns (uint256)',
  'function getOwners() view returns (address[])',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)',
])
const tlAbi = parseAbi([
  'function hashOperation(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt) pure returns (bytes32)',
  'function isOperation(bytes32 id) view returns (bool)',
  'function isOperationReady(bytes32 id) view returns (bool)',
  'function isOperationDone(bytes32 id) view returns (bool)',
  'function getTimestamp(bytes32 id) view returns (uint256)',
])
const msAbi = parseAbi(['function multiSend(bytes transactions) payable'])
const ZERO32 = '0x' + '0'.repeat(64)

async function opState() {
  const out = []
  for (const c of plan.calls) {
    const id = await client.readContract({ address: TL, abi: tlAbi, functionName: 'hashOperation', args: [c.target, 0n, c.data, ZERO32, c.salt] })
    const [queued, ready, done, ts] = await Promise.all([
      client.readContract({ address: TL, abi: tlAbi, functionName: 'isOperation', args: [id] }),
      client.readContract({ address: TL, abi: tlAbi, functionName: 'isOperationReady', args: [id] }),
      client.readContract({ address: TL, abi: tlAbi, functionName: 'isOperationDone', args: [id] }),
      client.readContract({ address: TL, abi: tlAbi, functionName: 'getTimestamp', args: [id] }),
    ])
    out.push({ ...c, id, queued, ready, done, readyAt: Number(ts) })
  }
  return out
}

function cast(args, { capture = true } = {}) {
  return execFileSync(CAST, args, { stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'] })?.toString().trim()
}
function keystoreArgs(name) {
  if (env.KEYSTORE_DIR) return ['--keystore', `${env.KEYSTORE_DIR}/${name}`, ...(env.KEYSTORE_PASSWORD ? ['--password', env.KEYSTORE_PASSWORD] : [])]
  return ['--account', name]
}

async function buildSigned(mode, todo, nonce, owners, threshold) {
  // One MultiSend: each inner call goes Safe -> Timelock (schedule or execute).
  const packed = concatHex(todo.map((o) => {
    const data = mode === 'schedule' ? o.schedule : o.execute
    return encodePacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [0, TL, 0n, BigInt(size(data)), data])
  }))
  const msData = encodeFunctionData({ abi: msAbi, functionName: 'multiSend', args: [packed] })
  const txArgs = [MULTISEND, 0n, msData, 1, 0n, 0n, 0n, ZERO, ZERO]
  const hash = await client.readContract({ address: SAFE, abi: safeAbi, functionName: 'getTransactionHash', args: [...txArgs, nonce] })
  const sigs = []
  for (const name of OWNERS.slice(0, Number(threshold))) {
    console.log(`\n[${mode}] sign with keystore "${name}" (enter its password):`)
    const sig = cast(['wallet', 'sign', '--no-hash', hash, ...keystoreArgs(name)])
    const signer = await recoverAddress({ hash, signature: sig })
    if (!owners.map((x) => x.toLowerCase()).includes(signer.toLowerCase())) throw new Error(`keystore "${name}" is ${signer}, which is not an owner of ${SAFE}`)
    if (sigs.some((x) => x.signer === signer)) throw new Error(`keystore "${name}" is the same wallet as an earlier one; use two different owners`)
    sigs.push({ signer, sig })
  }
  sigs.sort((x, y) => (BigInt(x.signer) < BigInt(y.signer) ? -1 : 1))
  return encodeFunctionData({ abi: safeAbi, functionName: 'execTransaction', args: [...txArgs, concatHex(sigs.map((x) => x.sig))] })
}

const fmt = (t) => new Date(t * 1000).toLocaleString()
function printState(ops) {
  for (const o of ops) console.log(`${o.done ? 'done   ' : o.ready ? 'READY  ' : o.queued ? `queued until ${fmt(o.readyAt)}` : 'not queued'}  ${o.label}`)
}
async function safeInfo() {
  const [nonce, threshold, owners] = await Promise.all([
    client.readContract({ address: SAFE, abi: safeAbi, functionName: 'nonce' }),
    client.readContract({ address: SAFE, abi: safeAbi, functionName: 'getThreshold' }),
    client.readContract({ address: SAFE, abi: safeAbi, functionName: 'getOwners' }),
  ])
  return { nonce, threshold, owners }
}
function sendNow(calldata) {
  const from = env.SEND_UNLOCKED_FROM ? ['--unlocked', '--from', env.SEND_UNLOCKED_FROM] : keystoreArgs(SENDER)
  cast(['send', SAFE, calldata, '--rpc-url', RPC, ...from], { capture: false })
}

// Pre-signed raw transaction from the deployer keystore, published later without any prompt.
const RAW_FILE = env.RAW_FILE || `scripts/mainnet/out/execute-raw-${CHAIN_ID}.json`
function makeRaw(calldata, nonce) {
  const args = ['mktx', SAFE, calldata, '--rpc-url', RPC, '--gas-limit', '3000000', '--gas-price', env.MAX_GAS_WEI || '1000000000', '--priority-gas-price', '0']
  if (nonce !== undefined) args.push('--nonce', String(nonce))
  return cast([...args, ...keystoreArgs(SENDER)])
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function auto() {
  let ops = await opState()
  printState(ops)
  if (ops.every((o) => o.done)) return console.log('\neverything is already executed. The market is open.')
  const info = await safeInfo()
  let rawExecute = null
  if (fs.existsSync(RAW_FILE)) {
    const saved = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'))
    const sameSafe = saved.safe && getAddress(saved.safe) === SAFE
    const samePlan = JSON.stringify(saved.planIds) === JSON.stringify(ops.map((o) => o.id))
    if (!sameSafe || !samePlan) {
      console.log(`\nIgnoring ${RAW_FILE}: it was made for ${sameSafe ? 'a different action list' : `another Safe (${saved.safe ?? 'unknown'})`}.`)
      fs.rmSync(RAW_FILE)
    } else rawExecute = saved.raw ?? null
  }

  if (ops.some((o) => !o.queued)) {
    if (ops.some((o) => o.queued)) throw new Error('some actions are queued and some are not: run `schedule`, then this again')
    console.log(`\nAll passwords are asked now, then nothing more until the market is open.`)
    const schedCall = await buildSigned('schedule', ops, info.nonce, info.owners, info.threshold)
    const execCall = await buildSigned('execute', ops, info.nonce + 1n, info.owners, info.threshold)
    await client.call({ to: SAFE, data: schedCall })
    console.log(`\n[schedule] simulation ok. Deployer signs the schedule transaction now (enter its password):`)
    const rawSched = env.SEND_UNLOCKED_FROM ? null : makeRaw(schedCall)
    let nextNonce
    if (rawSched) {
      // cast wraps the result: {schema_version, success, data: "<json string>"} (older versions: the object itself)
      const out = JSON.parse(cast(['decode-transaction', rawSched, '--json']))
      const decoded = typeof out.data === 'string' ? JSON.parse(out.data) : out
      if (decoded.nonce === undefined) throw new Error('could not read the nonce of the signed schedule transaction')
      nextNonce = BigInt(decoded.nonce) + 1n
    }
    console.log(`\n[execute] deployer pre-signs the execute transaction for later (enter its password):`)
    if (!env.SEND_UNLOCKED_FROM) {
      rawExecute = makeRaw(execCall, nextNonce)
      fs.mkdirSync('scripts/mainnet/out', { recursive: true })
      fs.writeFileSync(RAW_FILE, JSON.stringify({ safe: SAFE, planIds: ops.map((o) => o.id), raw: rawExecute, createdAt: new Date().toISOString() }, null, 2))
      cast(['publish', rawSched, '--rpc-url', RPC], { capture: false })
    } else {
      sendNow(schedCall)
      fs.mkdirSync('scripts/mainnet/out', { recursive: true })
      fs.writeFileSync(RAW_FILE, JSON.stringify({ safe: SAFE, planIds: ops.map((o) => o.id), unlockedCall: execCall }, null, 2))
    }
    ops = await opState()
    console.log('\nScheduled:')
    printState(ops)
  } else if (!rawExecute && !fs.existsSync(RAW_FILE)) {
    console.log('\nActions are queued but no pre-signed execute transaction is saved. Signing it now:')
    const execCall = await buildSigned('execute', ops.filter((o) => !o.done), info.nonce, info.owners, info.threshold)
    rawExecute = env.SEND_UNLOCKED_FROM ? null : makeRaw(execCall)
    fs.writeFileSync(RAW_FILE, JSON.stringify({ safe: SAFE, planIds: ops.map((o) => o.id), ...(rawExecute ? { raw: rawExecute } : { unlockedCall: execCall }) }, null, 2))
  }

  // Wait for the timelock.
  const readyAt = Math.max(...ops.map((o) => o.readyAt))
  console.log(`\nWaiting until ${fmt(readyAt)} for the ${Math.round(plan.delay / 60)} min timelock. Keep this window open; your Mac is kept awake.`)
  const POLL = Number(env.POLL_MS || 300000)
  for (;;) {
    // A network blip must not end a two-day wait: retry the read instead of crashing.
    try { ops = await opState() } catch (e) {
      process.stdout.write(`\r  network error (${(e.shortMessage ?? e.message ?? '').split('\n')[0].slice(0, 60)}), retrying...   `)
      await sleep(15000)
      continue
    }
    if (ops.every((o) => o.done)) break
    if (ops.every((o) => o.ready || o.done)) {
      console.log('\nTimelock open. Executing...')
      const saved = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'))
      try {
        if (saved.raw) cast(['publish', saved.raw, '--rpc-url', RPC], { capture: false })
        else sendNow(saved.unlockedCall)
      } catch (e) {
        console.log(`\nThe pre-signed transaction could not be sent (${e.message?.split('\n')[0]}).`)
        console.log('Run: node scripts/mainnet/safe-run.mjs execute   (asks for passwords again)')
        process.exit(1)
      }
      await sleep(5000)
      continue
    }
    const left = readyAt - Math.floor(Date.now() / 1000)
    process.stdout.write(`\r  ${left > 0 ? `${Math.floor(left / 3600)} h ${Math.floor((left % 3600) / 60)} min left` : 'any moment now'}   `)
    await sleep(POLL)
  }
  fs.rmSync(RAW_FILE, { force: true })
  console.log('\n')
  printState(await opState())
  console.log('\nExecuted. The market is open.')
}

async function main() {
  if (MODE === 'auto') return auto()
  const ops = await opState()
  if (MODE === 'status') return printState(ops)
  let todo
  if (MODE === 'schedule') {
    todo = ops.filter((o) => !o.queued)
    if (!todo.length) return console.log('all actions are already scheduled. Run `status`, then `execute` after the delay.')
  } else if (MODE === 'execute') {
    const notQueued = ops.filter((o) => !o.queued)
    if (notQueued.length) return console.log(`${notQueued.length} action(s) not scheduled yet. Run \`schedule\` first.`)
    const waiting = ops.filter((o) => !o.done && !o.ready)
    if (waiting.length) {
      const at = Math.max(...waiting.map((o) => o.readyAt))
      const left = at - Math.floor(Date.now() / 1000)
      return console.log(`too early: ready at ${fmt(at)} (in ${Math.floor(left / 3600)} h ${Math.floor((left % 3600) / 60)} min). Nothing was sent.`)
    }
    todo = ops.filter((o) => !o.done)
    if (!todo.length) return console.log('everything is already executed. The market is open.')
  } else throw new Error('usage: safe-run.mjs auto|schedule|execute|status')

  const info = await safeInfo()
  console.log(`${MODE}: ${todo.length} action(s) in one Safe transaction (Safe ${SAFE}, nonce ${info.nonce}, needs ${info.threshold} of ${info.owners.length} signatures)`)
  for (const o of todo) console.log(`  - ${o.label}`)
  const calldata = await buildSigned(MODE, todo, info.nonce, info.owners, info.threshold)
  await client.call({ to: SAFE, data: calldata })
  console.log(`\nsimulation ok. Submitting (keystore "${SENDER}" pays the gas${env.SEND_UNLOCKED_FROM ? '' : ', enter its password'}):`)
  sendNow(calldata)
  const after = await opState()
  console.log('')
  printState(after)
  if (MODE === 'schedule') console.log(`\nScheduled. Run \`node scripts/mainnet/safe-run.mjs execute\` after ${fmt(Math.max(...after.map((o) => o.readyAt)))}.`)
  else console.log('\nExecuted. The market is open.')
}

main().catch((e) => { console.error('\nfailed:', e.shortMessage ?? e.message); process.exit(1) })
