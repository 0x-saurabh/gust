// Kyte keeper. Three jobs (SPEC.md §10): expire settled-by-time options, run the daily fee split, and run
// buybacks in bounded tranches. Expire and split are permissionless, so anyone can run this if the bot dies.
// It reads the chain directly (no indexer dependency).
//
//   node keeper/src/index.mjs
//   env: RPC_URL, CHAIN_ID (31337), KEEPER_PRIVATE_KEY (devnet default: anvil #0), INTERVAL_MS (30000),
//        BUYBACK_MIN_WETH (0.01), BUYBACK_SLIPPAGE_BPS (100), ALERT_WEBHOOK_URL (optional), ONCE=1 (single pass),
//        KEEPER_PRIVATE_KEY_FILE (read the key from a file/secret mount instead of the env), START_BLOCK (0),
//        MAX_GAS_GWEI (1 off devnet), MAX_SPOT_TWAP_DEVIATION_BPS (300), KEEPER_MIN_ETH (0.02)
//        PAYOUT_PRIVATE_KEY(_FILE) + STAKER_SHARE_KEEPER_TOKEN: the staker-share USDG payouts (docs/STAKER_USDG_SHARE.md)
import fs from 'node:fs'
import path from 'node:path'
import { createPublicClient, createWalletClient, formatEther, formatGwei, getAddress, http, parseAbiItem, parseEther, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname)
const CHAIN_ID = Number(process.env.CHAIN_ID || 31337)
const RPC_URL = process.env.RPC_URL || (CHAIN_ID === 31337 ? 'http://127.0.0.1:8547' : CHAIN_ID === 4663 ? 'https://rpc.mainnet.chain.robinhood.com' : CHAIN_ID === 99901 ? 'https://rpc.elysium.kinetiq.xyz' : CHAIN_ID === 99801 ? 'https://testnet-rpc.elysium.kinetiq.xyz' : 'https://rpc.testnet.chain.robinhood.com')
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
// Pasted keys often carry whitespace, quotes or no 0x prefix (dashboards, password managers): normalize them.
const normalizeKey = (k) => {
  const s = String(k).trim().replace(/^["']|["']$/g, '').trim().toLowerCase()
  return /^[0-9a-f]{64}$/.test(s) ? `0x${s}` : s
}
const KEY = normalizeKey(fileKey || process.env.KEEPER_PRIVATE_KEY || (DEVNET ? ANVIL_0 : ''))
if (!KEY) throw new Error('KEEPER_PRIVATE_KEY or KEEPER_PRIVATE_KEY_FILE is required outside the devnet')
if (!/^0x[0-9a-f]{64}$/.test(KEY)) throw new Error('keeper key must be 0x + 64 hex chars')
if (!DEVNET && ANVIL_KEYS.has(KEY)) throw new Error('refusing to run with a public anvil key outside the devnet')
delete process.env.KEEPER_PRIVATE_KEY // keep it out of child processes and crash dumps

// DEPLOYMENTS_FILE: rehearsals against a fork use their own copy of the deployment file.
const dep = JSON.parse(fs.readFileSync(process.env.DEPLOYMENTS_FILE || path.join(ROOT, `contracts/deployments/${CHAIN_ID}.json`), "utf8"))
// Fresh forge build when present (local dev), else the committed copies in indexer/abis (servers, Render).
const abiOf = (file, name) => {
  const built = path.join(ROOT, `contracts/out/${file}/${name}.json`)
  const shipped = path.join(ROOT, `indexer/abis/${name}.json`)
  return JSON.parse(fs.readFileSync(fs.existsSync(built) ? built : shipped, 'utf8')).abi
}
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

async function send(label, params, signer = { account, wallet }) {
  // A gas spike (or a lying RPC) must not be able to drain the keeper wallet.
  if (MAX_GAS_WEI) {
    const { maxFeePerGas, gasPrice } = await pub.estimateFeesPerGas().catch(() => ({}))
    const fee = maxFeePerGas ?? gasPrice ?? 0n
    if (fee > MAX_GAS_WEI) throw new Error(`gas ${formatGwei(fee)} gwei above MAX_GAS_GWEI, skipped ${label}`)
  }
  const { request } = await pub.simulateContract({ account: signer.account, ...params })
  if (MAX_GAS_WEI && request.maxFeePerGas && request.maxFeePerGas > MAX_GAS_WEI) request.maxFeePerGas = MAX_GAS_WEI
  const hash = await signer.wallet.writeContract(request)
  const r = await pub.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(`${label} reverted (${hash})`)
  log(label, 'ok', hash)
  return r
}

// Live filled ids per market, built from OfferCreated logs seen so far and pruned when settled.
// Older markets keep settling their open positions after a newer set (deployments `v2`, `v3`) goes live, so all are watched.
const MARKETS = [dep.callMarket, dep.putMarket, dep.v2?.callMarket, dep.v2?.putMarket, dep.v3?.callMarket, dep.v3?.putMarket]
  .filter(Boolean)
  .map((a) => getAddress(a))
const tracked = Object.fromEntries(MARKETS.map((m) => [m, new Set()]))
let scanned = START_BLOCK - 1n
async function refreshTracked() {
  const latest = await pub.getBlockNumber()
  // chunked, so a long history doesn't become one huge getLogs the RPC rejects
  while (scanned < latest) {
    const to = scanned + 5_000n < latest ? scanned + 5_000n : latest
    const logs = await pub.getLogs({ address: MARKETS, event: OFFER_CREATED, fromBlock: scanned + 1n, toBlock: to })
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
  // Chains without $KYTE (Elysium, docs/ELYSIUM.md): the buyback share sits in a RewardSink, nothing to buy or burn.
  if (dep.rewardSink && getAddress(dep.rewardSink) === getAddress(b)) return
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

// ---- Launchpad listings: the indexer says which tokens clear the bar (Pons: graduated; FOBO: floor backs 4.2 ETH
// after 24 h); the lister contract verifies on chain and runs the timelock operation. Needs deployments.ponsLister /
// deployments.foboLister (set after the Safe grants them the timelock roles) and INDEXER_URL.
const INDEXER_URL = (process.env.INDEXER_URL || '').replace(/\/$/, '')
const LISTER_ABI = [
  { type: 'function', name: 'list', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'execute', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { type: 'function', name: 'check', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
  { type: 'function', name: 'operationOf', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'timelockController', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
]
const TL_ABI = [
  { type: 'function', name: 'isOperationReady', stateMutability: 'view', inputs: [{ name: 'id', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'isOperationDone', stateMutability: 'view', inputs: [{ name: 'id', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'isOperationPending', stateMutability: 'view', inputs: [{ name: 'id', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
]
const ZERO32 = '0x' + '0'.repeat(64)
const INDEXER_FALLBACK_URL = (process.env.INDEXER_FALLBACK_URL || 'http://127.0.0.1:4201').replace(/\/$/, '')
const LAUNCHPADS = [
  { name: 'pons', lister: () => dep.ponsLister, path: '/pons/tokens?status=graduated&limit=200', pick: (t) => t.pairIsWeth },
  { name: 'fobo', lister: () => dep.foboLister, path: '/fobo/tokens?status=eligible&limit=200', pick: (t) => t.quoteIsEth && t.eligible },
]
const listerState = Object.fromEntries(LAUNCHPADS.map((l) => [l.name, {
  skip: new Map(), // token -> until (ms): don't re-check a token that failed its on-chain checks for an hour
  pending: new Map(), // token -> symbol: scheduled by us or seen pending; executed without needing the indexer
}]))
async function jobLister({ name, lister: addrOf, path: p, pick }) {
  const lister = addrOf()
  if (!lister || !INDEXER_URL) return
  if (await pub.readContract({ address: lister, abi: LISTER_ABI, functionName: 'paused' })) return
  const { skip, pending } = listerState[name]
  // Candidates from the indexer (production first, local fallback); plus every token this keeper has seen
  // scheduled, so a pending listing executes even while both indexers are down.
  let tokens = []
  for (const base of [INDEXER_URL, INDEXER_FALLBACK_URL].filter(Boolean)) {
    try {
      const r = await fetch(`${base}${p}`, { signal: AbortSignal.timeout(10_000) })
      if (!r.ok) throw new Error(`indexer ${r.status}`)
      tokens = (await r.json()).tokens; break
    } catch (e) { log(`${name}: ${base} unavailable (${e.message})`) }
  }
  const candidates = new Map()
  for (const t of tokens) if (pick(t) && (t.kyte === 'unlisted' || t.kyte === 'scheduled')) candidates.set(getAddress(t.address), t.symbol)
  for (const [a, s] of pending) if (!candidates.has(a)) candidates.set(a, s)
  const timelockAddr = await pub.readContract({ address: lister, abi: LISTER_ABI, functionName: 'timelockController' })
  for (const [token, symbol] of candidates) {
    if ((skip.get(token) ?? 0) > Date.now()) continue
    const op = await pub.readContract({ address: lister, abi: LISTER_ABI, functionName: 'operationOf', args: [token] })
    if (op === ZERO32) {
      try { await pub.readContract({ address: lister, abi: LISTER_ABI, functionName: 'check', args: [token] }) }
      catch (e) { skip.set(token, Date.now() + 3_600_000); log(`${name} ${symbol}: not listable (${e.shortMessage ?? e.message})`); continue }
      await send(`${name}Lister.list ${symbol}`, { address: lister, abi: LISTER_ABI, functionName: 'list', args: [token] })
      pending.set(token, symbol)
    } else if (await pub.readContract({ address: timelockAddr, abi: TL_ABI, functionName: 'isOperationReady', args: [op] })) {
      await send(`${name}Lister.execute ${symbol}`, { address: lister, abi: LISTER_ABI, functionName: 'execute', args: [token] })
      pending.delete(token)
    } else if (!(await pub.readContract({ address: timelockAddr, abi: TL_ABI, functionName: 'isOperationPending', args: [op] }))) {
      pending.delete(token)
      skip.set(token, Date.now() + 3_600_000) // done or cancelled; the timelock can reset() if it should run again
    } else pending.set(token, symbol)
  }
}
const jobPonsList = () => jobLister(LAUNCHPADS[0])
const jobFoboList = () => jobLister(LAUNCHPADS[1])

// ---- USDG rewards: publish each final epoch's root from the indexer's tree (docs/USDG_REWARDS.md), sweep expired ones.
// Needs deployments.usdgRewards (this keeper must be its publisher) and INDEXER_URL. The contract refuses a root the
// unowed USDG balance cannot cover, so an unfunded epoch simply waits.
const REWARDS_ABI = [
  { type: 'function', name: 'publish', stateMutability: 'nonpayable', inputs: [{ name: 'epoch', type: 'uint256' }, { name: 'root', type: 'bytes32' }, { name: 'total', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'sweep', stateMutability: 'nonpayable', inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'epochs', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }], outputs: [{ type: 'bytes32' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'uint64' }, { type: 'uint64' }, { type: 'bool' }] },
  { type: 'function', name: 'available', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'publisher', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
]
const rewardsSkip = new Map() // epoch -> until (ms)
async function jobRewards() {
  const c = dep.usdgRewards
  if (!c || !INDEXER_URL) return
  const [publisher, paused] = await Promise.all([pub.readContract({ address: c, abi: REWARDS_ABI, functionName: 'publisher' }), pub.readContract({ address: c, abi: REWARDS_ABI, functionName: 'paused' })])
  if (getAddress(publisher) !== account.address) { await alert(`rewards publisher is ${publisher}, this bot is ${account.address}`); return }
  if (paused) return
  let program
  try { const r = await fetch(`${INDEXER_URL}/rewards`, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`indexer ${r.status}`); program = await r.json() } catch (e) { log(`rewards: indexer unavailable (${e.message})`); return }
  const nowSec = Number((await pub.getBlock()).timestamp)
  for (const e of program.epochs ?? []) {
    if ((rewardsSkip.get(e.epoch) ?? 0) > Date.now()) continue
    const [root, , , , expiresAt, swept] = await pub.readContract({ address: c, abi: REWARDS_ABI, functionName: 'epochs', args: [BigInt(e.epoch)] })
    if (root !== ZERO32) {
      if (!swept && Number(expiresAt) < nowSec) await send(`usdgRewards.sweep ${e.epoch}`, { address: c, abi: REWARDS_ABI, functionName: 'sweep', args: [BigInt(e.epoch)] })
      continue
    }
    if (!e.root || e.totalUsdg <= 0) continue // nothing to pay in that epoch
    let tree
    try { const r = await fetch(`${INDEXER_URL}/rewards/epoch/${e.epoch}`, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`indexer ${r.status}`); tree = await r.json() } catch (err) { log(`rewards: epoch ${e.epoch} tree unavailable (${err.message})`); continue }
    if (!tree.final || !tree.root || tree.root !== e.root) continue // the indexer is still settling this epoch
    const total = BigInt(tree.total)
    const avail = await pub.readContract({ address: c, abi: REWARDS_ABI, functionName: 'available' })
    if (avail < total) { rewardsSkip.set(e.epoch, Date.now() + 3_600_000); await alert(`rewards epoch ${e.epoch} needs ${Number(total) / 1e6} USDG, ${Number(avail) / 1e6} available: fund ${c}`); continue }
    await send(`usdgRewards.publish ${e.epoch} (${Number(total) / 1e6} USDG, ${tree.leaves?.length ?? '?'} accounts)`, { address: c, abi: REWARDS_ABI, functionName: 'publish', args: [BigInt(e.epoch), tree.root, total] })
  }
}

// ---- Staker share: pays each epoch's USDG table (indexer /staker-share) wallet to wallet from a dedicated payout
// wallet (docs/STAKER_USDG_SHARE.md). The payout key is separate from the keeper key on purpose: it holds the USDG
// float the treasury tops up, and nothing else. Both keys are plain EOAs, so the funds are always withdrawable by
// whoever holds the key; no contract holds them. Needs PAYOUT_PRIVATE_KEY(_FILE), STAKER_SHARE_KEEPER_TOKEN, INDEXER_URL.
// env: STAKER_SHARE_USDG (token address; default: USDG on Robinhood Chain), STAKER_SHARE_DRY_RUN=1 (print the table, send nothing),
//      PAYOUT_MIN_ETH (0.005: alert when the payout wallet runs low on gas)
const USDG = getAddress(process.env.STAKER_SHARE_USDG || (CHAIN_ID === 4663 ? '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' : '0x0000000000000000000000000000000000000000'))
const PAYOUT_TOKEN = process.env.STAKER_SHARE_KEEPER_TOKEN || ''
const PAYOUT_DRY = process.env.STAKER_SHARE_DRY_RUN === '1'
const PAYOUT_MIN_ETH = parseEther(process.env.PAYOUT_MIN_ETH || '0.005')
const payoutFileKey = process.env.PAYOUT_PRIVATE_KEY_FILE ? fs.readFileSync(process.env.PAYOUT_PRIVATE_KEY_FILE, 'utf8').trim() : ''
const PAYOUT_KEY = payoutFileKey || process.env.PAYOUT_PRIVATE_KEY ? normalizeKey(payoutFileKey || process.env.PAYOUT_PRIVATE_KEY) : ''
delete process.env.PAYOUT_PRIVATE_KEY
let payout = null
if (PAYOUT_KEY) {
  if (!/^0x[0-9a-f]{64}$/.test(PAYOUT_KEY)) throw new Error('payout key must be 0x + 64 hex chars')
  if (!DEVNET && ANVIL_KEYS.has(PAYOUT_KEY)) throw new Error('refusing to run the payout wallet with a public anvil key outside the devnet')
  if (PAYOUT_KEY === KEY) throw new Error('PAYOUT_PRIVATE_KEY must differ from KEEPER_PRIVATE_KEY: the USDG float stays out of the ops wallet')
  const acct = privateKeyToAccount(PAYOUT_KEY)
  payout = { account: acct, wallet: createWalletClient({ account: acct, chain, transport: http(RPC_URL) }) }
}
const ERC20_TRANSFER_ABI = [
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
]
const stakerSkip = new Map() // epoch -> until (ms)
async function recordPaid(epoch, account, tx) {
  const r = await fetch(`${INDEXER_URL}/staker-share/paid`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-keeper-token': PAYOUT_TOKEN }, body: JSON.stringify({ epoch, account, tx }), signal: AbortSignal.timeout(15_000) })
  if (!r.ok) throw new Error(`indexer ${r.status} recording ${account} epoch ${epoch} tx ${tx}`)
}
async function jobStakerShare() {
  if (!payout || !INDEXER_URL) return
  if (!PAYOUT_TOKEN && !PAYOUT_DRY) { await alert('staker share: STAKER_SHARE_KEEPER_TOKEN missing, payouts could not be recorded; skipping'); return }
  let program
  try { const r = await fetch(`${INDEXER_URL}/staker-share`, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`indexer ${r.status}`); program = await r.json() } catch (e) { log(`staker share: indexer unavailable (${e.message})`); return }
  const due = (program.due ?? []).filter((d) => (stakerSkip.get(d.epoch) ?? 0) <= Date.now())
  if (!due.length) return
  const [usdgBal, ethBal] = await Promise.all([
    pub.readContract({ address: USDG, abi: ERC20_TRANSFER_ABI, functionName: 'balanceOf', args: [payout.account.address] }),
    pub.getBalance({ address: payout.account.address }),
  ])
  if (ethBal < PAYOUT_MIN_ETH) await alert(`payout wallet ${payout.account.address} low on gas: ${formatEther(ethBal)} ETH`)
  for (const d of due) {
    let table
    try { const r = await fetch(`${INDEXER_URL}/staker-share/epoch/${d.epoch}`, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`indexer ${r.status}`); table = await r.json() } catch (e) { log(`staker share: epoch ${d.epoch} table unavailable (${e.message})`); continue }
    if (!table.final) continue
    const rows = (table.payouts ?? []).filter((p) => p.status === 'due')
    const total = rows.reduce((s, p) => s + BigInt(p.amount), 0n)
    if (!rows.length) continue
    if (PAYOUT_DRY) { log(`staker share DRY RUN epoch ${d.epoch}: ${rows.length} transfers, ${Number(total) / 1e6} USDG`); for (const p of rows) log(`  ${p.account} ${p.amountUsdg} USDG (stake ${Math.round(p.stake)})`); continue }
    if (usdgBal < total) {
      stakerSkip.set(d.epoch, Date.now() + 3_600_000)
      await alert(`staker share epoch ${d.epoch} needs ${Number(total) / 1e6} USDG, payout wallet ${payout.account.address} has ${Number(usdgBal) / 1e6}: top it up from the Safe`)
      continue
    }
    for (const p of rows) {
      // one transfer, then record it; a crash in between leaves the row `due` and the next tick resends, so the
      // indexer is checked first (a transfer that was recorded meanwhile is not repeated)
      const r = await send(`usdg.transfer ${p.amountUsdg} to ${p.account} (staker share epoch ${d.epoch})`, { address: USDG, abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [getAddress(p.account), BigInt(p.amount)] }, payout)
      await recordPaid(d.epoch, p.account, r.transactionHash)
    }
    log(`staker share epoch ${d.epoch}: paid ${rows.length} stakers, ${Number(total) / 1e6} USDG`)
  }
}

async function tick() {
  await checkBalance().catch(() => {})
  // Launchpad listings first: they are cheap and time-sensitive, while the expiry scan can take minutes after a restart.
  for (const [name, job] of [['ponsList', jobPonsList], ['foboList', jobFoboList], ['expire', jobExpire], ['split', jobSplit], ['buyback', jobBuyback], ['rewards', jobRewards], ['stakerShare', jobStakerShare]]) {
    try { await job() } catch (e) { await alert(`${name} failed: ${e.shortMessage ?? e.message}`) }
  }
}

// Refuse to sign anything until the RPC and the deployment file agree on the chain and the contracts exist.
const rpcChain = await pub.getChainId()
if (rpcChain !== CHAIN_ID) throw new Error(`RPC is chain ${rpcChain}, expected ${CHAIN_ID}`)
for (const k of ['callMarket', 'putMarket', 'feeVault', 'weth']) {
  if (!dep[k] || (await pub.getCode({ address: dep[k] })) === undefined) throw new Error(`${k} has no code at ${dep[k]} on chain ${CHAIN_ID}`)
}
for (const m of MARKETS) if ((await pub.getCode({ address: m })) === undefined) throw new Error(`market ${m} has no code on chain ${CHAIN_ID}`)
log(`chain ${CHAIN_ID}, keeper ${account.address}${MAX_GAS_WEI ? `, gas cap ${formatGwei(MAX_GAS_WEI)} gwei` : ''}`)
if (payout) log(`staker share payout wallet ${payout.account.address}${PAYOUT_DRY ? ' (DRY RUN)' : ''}`)
await tick()
if (process.env.ONCE) process.exit(0)
setInterval(tick, INTERVAL_MS)
