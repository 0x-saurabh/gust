// Kyte keeper. Three jobs (SPEC.md §10): expire settled-by-time options, run the daily fee split, and run
// buybacks in bounded tranches. Expire and split are permissionless, so anyone can run this if the bot dies.
// It reads the chain directly (no indexer dependency).
//
//   node keeper/src/index.mjs
//   env: RPC_URL, CHAIN_ID (31337), KEEPER_PRIVATE_KEY (devnet default: anvil #0), INTERVAL_MS (30000),
//        BUYBACK_MIN_WETH (0.01), BUYBACK_SLIPPAGE_BPS (100), ALERT_WEBHOOK_URL (optional), ONCE=1 (single pass),
//        KEEPER_PRIVATE_KEY_FILE (read the key from a file/secret mount instead of the env), START_BLOCK (0),
//        MAX_GAS_GWEI (1 off devnet), MAX_SPOT_TWAP_DEVIATION_BPS (300), KEEPER_MIN_ETH (0.02)
import fs from 'node:fs'
import path from 'node:path'
import { createPublicClient, createWalletClient, formatEther, formatGwei, getAddress, http, parseAbiItem, parseEther, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname)
const CHAIN_ID = Number(process.env.CHAIN_ID || 31337)
const RPC_URL = process.env.RPC_URL || (CHAIN_ID === 31337 ? 'http://127.0.0.1:8547' : CHAIN_ID === 4663 ? 'https://rpc.mainnet.chain.robinhood.com' : 'https://rpc.testnet.chain.robinhood.com')
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 30_000)
const BUYBACK_MIN = parseEther(process.env.BUYBACK_MIN_WETH || '0.01')
const SLIPPAGE_BPS = BigInt(process.env.BUYBACK_SLIPPAGE_BPS || 100)
const START_BLOCK = BigInt(process.env.START_BLOCK || 0)
const DEVNET = CHAIN_ID === 31337
const MAX_GAS_WEI = process.env.MAX_GAS_GWEI ? parseGwei(process.env.MAX_GAS_GWEI) : DEVNET ? null : parseGwei('1')
const MAX_DEVIATION_BPS = BigInt(process.env.MAX_SPOT_TWAP_DEVIATION_BPS || 300)
const MIN_ETH = parseEther(process.env.KEEPER_MIN_ETH || '0.02')
const ANVIL_0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
// anvil's public default keys: anyone can sign with these, so they must never run anywhere real
const ANVIL_KEYS = new Set([ANVIL_0, '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e', '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356', '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97', '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6'])
const fileKey = process.env.KEEPER_PRIVATE_KEY_FILE ? fs.readFileSync(process.env.KEEPER_PRIVATE_KEY_FILE, 'utf8').trim() : ''
const KEY = (fileKey || process.env.KEEPER_PRIVATE_KEY || (DEVNET ? ANVIL_0 : '')).toLowerCase()
if (!KEY) throw new Error('KEEPER_PRIVATE_KEY or KEEPER_PRIVATE_KEY_FILE is required outside the devnet')
if (!/^0x[0-9a-f]{64}$/.test(KEY)) throw new Error('keeper key must be 0x + 64 hex chars')
if (!DEVNET && ANVIL_KEYS.has(KEY)) throw new Error('refusing to run with a public anvil key outside the devnet')
delete process.env.KEEPER_PRIVATE_KEY // keep it out of child processes and crash dumps

const dep = JSON.parse(fs.readFileSync(path.join(ROOT, `contracts/deployments/${CHAIN_ID}.json`), 'utf8'))
const abiOf = (file, name) => JSON.parse(fs.readFileSync(path.join(ROOT, `contracts/out/${file}/${name}.json`), 'utf8')).abi
const ABI = {
  market: abiOf('CallMarket.sol', 'CallMarket'),
  vault: abiOf('FeeVault.sol', 'FeeVault'),
  burner: abiOf('BuybackBurner.sol', 'BuybackBurner'),
  adapter: abiOf('UniswapV4Adapter.sol', 'UniswapV4Adapter'),
  erc20: abiOf('Mocks.sol', 'MockERC20'),
}
const OFFER_CREATED = parseAbiItem('event OfferCreated(uint256 indexed id, address indexed seller, address indexed token, uint256 amount, uint256 strike, uint256 premium, uint64 expiry, uint64 offerDeadline)')

const chain = { id: CHAIN_ID, name: `chain-${CHAIN_ID}`, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } }
const account = privateKeyToAccount(KEY)
const pub = createPublicClient({ chain, transport: http(RPC_URL) })
const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) })
const log = (...a) => console.log(new Date().toISOString(), '[keeper]', ...a)

async function alert(msg) {
  log('ALERT', msg)
  if (!process.env.ALERT_WEBHOOK_URL) return
  try { await fetch(process.env.ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `[kyte keeper] ${msg}` }) }) } catch {}
}

async function send(label, params) {
  // A gas spike (or a lying RPC) must not be able to drain the keeper wallet.
  if (MAX_GAS_WEI) {
    const { maxFeePerGas, gasPrice } = await pub.estimateFeesPerGas().catch(() => ({}))
    const fee = maxFeePerGas ?? gasPrice ?? 0n
    if (fee > MAX_GAS_WEI) throw new Error(`gas ${formatGwei(fee)} gwei above MAX_GAS_GWEI, skipped ${label}`)
  }
  const { request } = await pub.simulateContract({ account, ...params })
  if (MAX_GAS_WEI && request.maxFeePerGas && request.maxFeePerGas > MAX_GAS_WEI) request.maxFeePerGas = MAX_GAS_WEI
  const hash = await wallet.writeContract(request)
  const r = await pub.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(`${label} reverted (${hash})`)
  log(label, 'ok', hash)
  return r
}

// Live filled ids per market, built from OfferCreated logs seen so far and pruned when settled.
const tracked = { [getAddress(dep.callMarket)]: new Set(), [getAddress(dep.putMarket)]: new Set() }
let scanned = START_BLOCK - 1n
async function refreshTracked() {
  const latest = await pub.getBlockNumber()
  // chunked, so a long history doesn't become one huge getLogs the RPC rejects
  while (scanned < latest) {
    const to = scanned + 5_000n < latest ? scanned + 5_000n : latest
    const logs = await pub.getLogs({ address: [dep.callMarket, dep.putMarket], event: OFFER_CREATED, fromBlock: scanned + 1n, toBlock: to })
    for (const l of logs) tracked[getAddress(l.address)].add(l.args.id)
    scanned = to
  }
}

async function jobExpire() {
  await refreshTracked()
  // Chain time, not wall clock: the contracts compare against block.timestamp.
  const now = (await pub.getBlock()).timestamp
  for (const [market, ids] of Object.entries(tracked)) {
    const due = []
    for (const id of ids) {
      const p = await pub.readContract({ address: market, abi: ABI.market, functionName: 'getPosition', args: [id] })
      if (p.status === 2 && BigInt(p.expiry) <= now) due.push(id)
      else if (p.status >= 3 || p.status === 5) ids.delete(id)
    }
    for (let i = 0; i < due.length; i += 50) {
      const batch = due.slice(i, i + 50)
      await send(`expireMany(${batch.length}) on ${market.slice(0, 8)}`, { address: market, abi: ABI.market, functionName: 'expireMany', args: [batch] })
      batch.forEach((id) => ids.delete(id))
    }
  }
}

async function jobSplit() {
  const vault = dep.feeVault
  const [bal, epoch, last, pool] = await Promise.all([
    pub.readContract({ address: dep.weth, abi: ABI.erc20, functionName: 'balanceOf', args: [vault] }),
    pub.readContract({ address: vault, abi: ABI.vault, functionName: 'currentEpoch' }),
    pub.readContract({ address: vault, abi: ABI.vault, functionName: 'lastSplitEpoch' }),
    pub.readContract({ address: vault, abi: ABI.vault, functionName: 'stakingPool' }),
  ])
  if (bal === 0n || epoch <= last || pool === '0x0000000000000000000000000000000000000000') return
  await send(`split ${formatEther(bal)} WETH (epoch ${epoch})`, { address: vault, abi: ABI.vault, functionName: 'split' })
}

async function jobBuyback() {
  const b = dep.buybackBurner
  if (!b) return
  const [bal, adapter, maxPerCall, keeper, paused] = await Promise.all([
    pub.readContract({ address: dep.weth, abi: ABI.erc20, functionName: 'balanceOf', args: [b] }),
    pub.readContract({ address: b, abi: ABI.burner, functionName: 'adapter' }),
    pub.readContract({ address: b, abi: ABI.burner, functionName: 'maxPerCall' }),
    pub.readContract({ address: b, abi: ABI.burner, functionName: 'keeper' }),
    pub.readContract({ address: b, abi: ABI.burner, functionName: 'paused' }),
  ])
  if (paused || bal < BUYBACK_MIN || adapter === '0x0000000000000000000000000000000000000000') return
  if (getAddress(keeper) !== account.address) { await alert(`buyback keeper is ${keeper}, this bot is ${account.address}`); return }
  const amount = bal < maxPerCall ? bal : maxPerCall
  const quote = await pub.readContract({ address: adapter, abi: ABI.adapter, functionName: 'quoteWethForToken', args: [amount] })
  // Manipulation check: if spot is far from the TWAP quote, someone may be setting up a sandwich. Wait.
  const spot = await pub.readContract({ address: adapter, abi: ABI.adapter, functionName: 'quoteSpot', args: [amount] }).catch(() => null)
  if (spot !== null && quote > 0n) {
    const diff = spot > quote ? spot - quote : quote - spot
    if (diff * 10_000n > quote * MAX_DEVIATION_BPS) {
      await alert(`buyback skipped: spot ${formatEther(spot)} vs TWAP ${formatEther(quote)} differ by more than ${MAX_DEVIATION_BPS} bps`)
      return
    }
  }
  const minOut = (quote * (10_000n - SLIPPAGE_BPS)) / 10_000n
  const deadline = (await pub.getBlock()).timestamp + 120n
  await send(`buyAndBurn ${formatEther(amount)} WETH (minOut ${formatEther(minOut)})`, { address: b, abi: ABI.burner, functionName: 'buyAndBurn', args: [amount, minOut, deadline] })
}

async function checkBalance() {
  const bal = await pub.getBalance({ address: account.address })
  if (bal < MIN_ETH) await alert(`keeper ${account.address} low on gas: ${formatEther(bal)} ETH`)
}

async function tick() {
  await checkBalance().catch(() => {})
  for (const [name, job] of [['expire', jobExpire], ['split', jobSplit], ['buyback', jobBuyback]]) {
    try { await job() } catch (e) { await alert(`${name} failed: ${e.shortMessage ?? e.message}`) }
  }
}

// Refuse to sign anything until the RPC and the deployment file agree on the chain and the contracts exist.
const rpcChain = await pub.getChainId()
if (rpcChain !== CHAIN_ID) throw new Error(`RPC is chain ${rpcChain}, expected ${CHAIN_ID}`)
for (const k of ['callMarket', 'putMarket', 'feeVault', 'weth']) {
  if (!dep[k] || (await pub.getCode({ address: dep[k] })) === undefined) throw new Error(`${k} has no code at ${dep[k]} on chain ${CHAIN_ID}`)
}
log(`chain ${CHAIN_ID}, keeper ${account.address}${MAX_GAS_WEI ? `, gas cap ${formatGwei(MAX_GAS_WEI)} gwei` : ''}`)
await tick()
if (process.env.ONCE) process.exit(0)
setInterval(tick, INTERVAL_MS)
