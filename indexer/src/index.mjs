// Kyte indexer + API. Follows the chain, keeps offers / positions / splits / burns / stake events in SQLite
// (node:sqlite, no native build), and serves JSON over HTTP. Status is always re-read from the contracts
// for any position touched by an event, so a reorg or a missed log can't leave a stale row.
//
//   node indexer/src/index.mjs
//   env: RPC_URL (http://127.0.0.1:8547), CHAIN_ID (31337), PORT (4200), POLL_MS (2000), START_BLOCK (0),
//        HOST (127.0.0.1; put a TLS reverse proxy in front), CORS_ORIGINS (comma list, default *),
//        RATE_LIMIT_PER_MIN (240 per IP), TRUST_PROXY (1 = use X-Forwarded-For for the client IP)
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createPublicClient, decodeEventLog, encodeAbiParameters, formatUnits, getAddress, http as httpTransport, keccak256, toHex, toEventSelector } from 'viem'

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname)
const CHAIN_ID = Number(process.env.CHAIN_ID || 31337)
const RPC_URL = process.env.RPC_URL || (CHAIN_ID === 31337 ? 'http://127.0.0.1:8547' : CHAIN_ID === 4663 ? 'https://rpc.mainnet.chain.robinhood.com' : 'https://rpc.testnet.chain.robinhood.com')
const PORT = Number(process.env.PORT || 4200)
const POLL_MS = Number(process.env.POLL_MS || 2000)
const START_BLOCK = BigInt(process.env.START_BLOCK || 0)
const HOST = process.env.HOST || '127.0.0.1'
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 240)
const TRUST_PROXY = process.env.TRUST_PROXY === '1'
if (CHAIN_ID !== 31337 && !process.env.START_BLOCK) console.warn('[indexer] START_BLOCK not set: scanning from genesis')
const REORG_DEPTH = 8n
const CHUNK = 2000n

const dep = JSON.parse(fs.readFileSync(path.join(ROOT, `contracts/deployments/${CHAIN_ID}.json`), 'utf8'))
// Fresh forge build when present (local dev), else the committed copies in indexer/abis (servers, Render).
const abiOf = (file, name) => {
  const built = path.join(ROOT, `contracts/out/${file}/${name}.json`)
  const shipped = path.join(ROOT, `indexer/abis/${name}.json`)
  return JSON.parse(fs.readFileSync(fs.existsSync(built) ? built : shipped, 'utf8')).abi
}
const ABI = {
  market: abiOf('CallMarket.sol', 'CallMarket'),
  put: abiOf('PutMarket.sol', 'PutMarket'),
  nft: abiOf('OptionNFT.sol', 'OptionNFT'),
  vault: abiOf('FeeVault.sol', 'FeeVault'),
  burner: abiOf('BuybackBurner.sol', 'BuybackBurner'),
  pool: abiOf('StakingPool.sol', 'StakingPool'),
  registry: abiOf('AssetRegistry.sol', 'AssetRegistry'),
  erc20: abiOf('Mocks.sol', 'MockERC20'),
  poolManager: abiOf('PoolManager.sol', 'PoolManager'),
}
const A = Object.fromEntries(
  Object.entries({
    calls: dep.callMarket, puts: dep.putMarket, nft: dep.optionNft, vault: dep.feeVault,
    burner: dep.buybackBurner, pool: dep.stakingPool, registry: dep.assetRegistry, poolManager: dep.uniswapV4PoolManager,
  }).map(([k, v]) => [k, v ? getAddress(v) : undefined]),
)
// Only addresses that exist in the deployment file (a missing one would otherwise become the key "undefined").
const abiFor = Object.fromEntries(
  [[A.calls, ABI.market], [A.puts, ABI.put], [A.nft, ABI.nft], [A.vault, ABI.vault], [A.burner, ABI.burner], [A.pool, ABI.pool], [A.registry, ABI.registry], [A.poolManager, ABI.poolManager]]
    .filter(([addr]) => addr),
)
for (const k of ['calls', 'puts', 'nft', 'registry']) if (!A[k]) throw new Error(`deployments/${CHAIN_ID}.json is missing ${k}`)
const watched = Object.keys(abiFor)
const SWAP_TOPIC = toEventSelector('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)')
const SWAP_EVENT = ABI.poolManager.find((x) => x.type === 'event' && x.name === 'Swap')

const client = createPublicClient({ transport: httpTransport(RPC_URL, { retryCount: 6, retryDelay: 1500 }) })

// Uniswap v4 pools we price from (paired with WETH or native ETH): poolId -> { symbol, token, tokenIs0, fromBlock }.
// Prices are stored under the token's on-chain symbol, the same one the AssetRegistry / UI use (the KYTE pool's
// token may be called something else on chain, e.g. "TI"). `fromBlock` (optional) is where its swap history starts.
const poolId = (k) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }], [k.currency0, k.currency1, Number(k.fee), Number(k.tickSpacing), k.hooks]))
const POOLS = Object.fromEntries(
  await Promise.all(
    Object.entries(dep.pools ?? {}).map(async ([name, key]) => {
      const token = getAddress(name === 'KYTE' ? dep.kyteToken : dep.tokens?.[name])
      const symbol = name === 'KYTE' ? await client.readContract({ address: token, abi: ABI.erc20, functionName: 'symbol' }).catch(() => name) : name
      return [poolId(key).toLowerCase(), { symbol, token, tokenIs0: key.currency0.toLowerCase() === token.toLowerCase(), fromBlock: key.fromBlock }]
    }),
  ),
)

// ------------------------------------------------------------------ db
fs.mkdirSync(path.join(ROOT, 'indexer/data'), { recursive: true })
const db = new DatabaseSync(path.join(ROOT, `indexer/data/${CHAIN_ID}.sqlite`))
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS assets (address TEXT PRIMARY KEY, symbol TEXT, name TEXT, decimals INTEGER,
    enabled INTEGER, puts_enabled INTEGER, cap TEXT, min_strike TEXT);
  CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, kind TEXT, market TEXT, seller TEXT, token TEXT,
    symbol TEXT, decimals INTEGER, amount TEXT, strike TEXT, premium TEXT, expiry INTEGER, deadline INTEGER,
    status TEXT, holder TEXT, premium_fee TEXT, exercise_fee TEXT, created_block INTEGER, created_at INTEGER,
    created_tx TEXT, updated_block INTEGER);
  CREATE INDEX IF NOT EXISTS offers_status ON offers(status, deadline);
  CREATE INDEX IF NOT EXISTS offers_seller ON offers(seller);
  CREATE INDEX IF NOT EXISTS offers_holder ON offers(holder);
  CREATE TABLE IF NOT EXISTS splits (tx TEXT PRIMARY KEY, epoch INTEGER, block INTEGER, at INTEGER,
    stakers TEXT, buyback TEXT, ops TEXT);
  CREATE TABLE IF NOT EXISTS burns (key TEXT PRIMARY KEY, tx TEXT, block INTEGER, at INTEGER, weth_in TEXT, token_out TEXT);
  CREATE TABLE IF NOT EXISTS stake_events (key TEXT PRIMARY KEY, tx TEXT, user TEXT, type TEXT, amount TEXT, block INTEGER, at INTEGER);
  CREATE TABLE IF NOT EXISTS events (key TEXT PRIMARY KEY, name TEXT, block INTEGER, log_index INTEGER, at INTEGER, tx TEXT, args TEXT);
  CREATE TABLE IF NOT EXISTS prices (key TEXT PRIMARY KEY, symbol TEXT, block INTEGER, at INTEGER, price REAL, volume_eth REAL, tx TEXT);
  CREATE INDEX IF NOT EXISTS prices_symbol_at ON prices(symbol, at);
  CREATE INDEX IF NOT EXISTS events_block ON events(block DESC, log_index DESC);
`)
const q = {
  getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
  setMeta: db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  upsertAsset: db.prepare(`INSERT INTO assets VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(address) DO UPDATE SET
    enabled = excluded.enabled, puts_enabled = excluded.puts_enabled, cap = excluded.cap, min_strike = excluded.min_strike`),
  getAsset: db.prepare('SELECT * FROM assets WHERE address = ?'),
  upsertOffer: db.prepare(`INSERT INTO offers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    status = excluded.status, holder = excluded.holder, premium_fee = excluded.premium_fee,
    exercise_fee = excluded.exercise_fee, updated_block = excluded.updated_block`),
  getOffer: db.prepare('SELECT * FROM offers WHERE id = ?'),
  setFees: db.prepare('UPDATE offers SET premium_fee = COALESCE(?, premium_fee), exercise_fee = COALESCE(?, exercise_fee) WHERE id = ?'),
  upsertSplit: db.prepare('INSERT OR REPLACE INTO splits VALUES(?,?,?,?,?,?,?)'),
  upsertBurn: db.prepare('INSERT OR REPLACE INTO burns VALUES(?,?,?,?,?,?)'),
  upsertStake: db.prepare('INSERT OR REPLACE INTO stake_events VALUES(?,?,?,?,?,?,?)'),
  upsertEvent: db.prepare('INSERT OR REPLACE INTO events VALUES(?,?,?,?,?,?,?)'),
  upsertPrice: db.prepare('INSERT OR REPLACE INTO prices VALUES(?,?,?,?,?,?,?)'),
}
const ACTIVITY = new Set(['OfferCreated', 'OptionBought', 'Exercised', 'Expired', 'OfferCancelled', 'FeesSplit', 'Burned', 'Staked', 'Unstaked', 'Claimed'])
const jsonArgs = (a) => JSON.stringify(a, (_, v) => (typeof v === 'bigint' ? v.toString() : v))

// ------------------------------------------------------------------ chain helpers
const STATUS = ['none', 'open', 'filled', 'exercised', 'expired', 'cancelled']
const blockTime = new Map()
async function at(blockNumber) {
  if (!blockTime.has(blockNumber)) blockTime.set(blockNumber, Number((await client.getBlock({ blockNumber })).timestamp))
  return blockTime.get(blockNumber)
}

const decimalsCache = new Map()
async function decimalsOf(token) {
  if (!decimalsCache.has(token)) decimalsCache.set(token, await client.readContract({ address: token, abi: ABI.erc20, functionName: 'decimals' }))
  return decimalsCache.get(token)
}

async function refreshAsset(address) {
  address = getAddress(address)
  const [a, symbol, name] = await Promise.all([
    client.readContract({ address: A.registry, abi: ABI.registry, functionName: 'getAsset', args: [address] }),
    client.readContract({ address, abi: ABI.erc20, functionName: 'symbol' }),
    client.readContract({ address, abi: ABI.erc20, functionName: 'name' }),
  ])
  q.upsertAsset.run(address, symbol, name, a.decimals, a.enabled ? 1 : 0, a.enabled && a.putsEnabled ? 1 : 0, String(a.cap), String(a.minStrike))
}

async function refreshAllAssets() {
  const n = Number(await client.readContract({ address: A.registry, abi: ABI.registry, functionName: 'assetCount' }))
  for (let i = 0; i < n; i++) {
    const t = await client.readContract({ address: A.registry, abi: ABI.registry, functionName: 'listedTokens', args: [BigInt(i)] })
    await refreshAsset(t)
  }
}

/** Source of truth for a position: the market + the NFT. */
async function refreshOffer(id, market, blockNumber, created) {
  const p = await client.readContract({ address: market, abi: ABI.market, functionName: 'getPosition', args: [id] })
  const status = STATUS[p.status]
  let holder = null
  if (status === 'filled') {
    try { holder = await client.readContract({ address: A.nft, abi: ABI.nft, functionName: 'ownerOf', args: [id] }) } catch {}
  }
  const existing = q.getOffer.get(String(id))
  let asset = q.getAsset.get(getAddress(p.token))
  if (!asset) { await refreshAsset(p.token); asset = q.getAsset.get(getAddress(p.token)) }
  const kind = market === A.calls ? 'call' : 'put'
  q.upsertOffer.run(
    String(id), kind, market, getAddress(p.seller), getAddress(p.token), asset?.symbol ?? '?', asset?.decimals ?? 18,
    String(p.amount), String(p.strike), String(p.premium), Number(p.expiry), Number(p.offerDeadline), status, holder,
    existing?.premium_fee ?? null, existing?.exercise_fee ?? null,
    existing?.created_block ?? created?.block ?? Number(blockNumber), existing?.created_at ?? created?.at ?? (await at(blockNumber)),
    existing?.created_tx ?? created?.tx ?? null, Number(blockNumber),
  )
}

// Uniswap v4 PoolManager Swap: price of currency0 in currency1 = (sqrtPriceX96 / 2^96)^2, in raw units
async function recordSwap(log, args) {
  const pool = POOLS[String(args.id).toLowerCase()]
  if (!pool) return
  const dec = await decimalsOf(pool.token)
  const p = (Number(args.sqrtPriceX96) / 2 ** 96) ** 2
  const ethPerToken = (pool.tokenIs0 ? p : 1 / p) * 10 ** dec / 1e18
  const wethAmt = pool.tokenIs0 ? args.amount1 : args.amount0
  const volume = Math.abs(Number(wethAmt)) / 1e18
  q.upsertPrice.run(`${log.transactionHash}:${log.logIndex}`, pool.symbol, Number(log.blockNumber), await at(log.blockNumber), ethPerToken, volume, log.transactionHash)
}

// One-time swap history for pools created before START_BLOCK (or added to the config after the indexer had
// already passed them). Swap logs of our pools only, in big ranges, so tens of millions of blocks take a few
// requests. Done once per pool (meta `backfill:<poolId>`); rows are keyed by tx:logIndex, so overlaps are harmless.
// Only the last BACKFILL_DAYS: the chart shows at most 500 candles (~21 days at 1h), and every swap costs a
// getBlock for its timestamp, so years of history would be hours of rate-limited RPC calls for nothing.
const BACKFILL_SPAN = BigInt(process.env.BACKFILL_SPAN || 9_000_000)
const BACKFILL_DAYS = Number(process.env.BACKFILL_DAYS || 30)
async function backfillSwaps() {
  if (!A.poolManager) return
  const headBlock = await client.getBlock()
  const head = headBlock.number
  const sample = head > 1_000_000n ? head - 1_000_000n : 0n
  const secsPerBlock = (Number(headBlock.timestamp) - (await at(sample))) / Number(head - sample || 1n)
  const window = BigInt(Math.ceil((BACKFILL_DAYS * 86_400) / Math.max(secsPerBlock, 0.01)))
  const earliest = head > window ? head - window : 0n
  for (const [id, pool] of Object.entries(POOLS)) {
    if (pool.fromBlock == null || q.getMeta.get(`backfill:${id}`)) continue
    let span = BACKFILL_SPAN
    let n = 0
    const start = BigInt(pool.fromBlock) > earliest ? BigInt(pool.fromBlock) : earliest
    for (let from = start; from <= head; ) {
      const to = from + span - 1n > head ? head : from + span - 1n
      let logs
      try {
        logs = await client.getLogs({ address: A.poolManager, event: SWAP_EVENT, args: { id }, fromBlock: from, toBlock: to })
      } catch (e) {
        if (e.status === 429 || /rate limit/i.test(`${e.details ?? ''} ${e.message ?? ''}`)) { await new Promise((r) => setTimeout(r, 61_000)); continue }
        if (span <= 10_000n) throw e
        span /= 4n // RPC refused the range (too many results / too wide): retry smaller
        continue
      }
      for (const l of logs) await recordSwap(l, l.args)
      n += logs.length
      console.log(`[indexer] backfill ${pool.symbol}: blocks ${from}-${to}, ${logs.length} swaps`)
      from = to + 1n
    }
    q.setMeta.run(`backfill:${id}`, String(head))
    console.log(`[indexer] backfilled ${n} ${pool.symbol} swaps from block ${start}`)
  }
}

// ------------------------------------------------------------------ sync
let latestSeen = 0n
let chainNow = Math.floor(Date.now() / 1000) // latest block timestamp; the contracts use block.timestamp
async function syncRange(from, to) {
  // Protocol contracts: every log. PoolManager: only Swap logs of our own pools (on mainnet it emits every swap
  // of every pool on the chain).
  const protocol = watched.filter((x) => x !== A.poolManager)
  const ids = Object.keys(POOLS)
  const [plain, swaps] = await Promise.all([
    protocol.length ? client.getLogs({ address: protocol, fromBlock: from, toBlock: to }) : [],
    A.poolManager && ids.length
      ? client.request({ method: 'eth_getLogs', params: [{ address: A.poolManager, fromBlock: toHex(from), toBlock: toHex(to), topics: [SWAP_TOPIC, ids] }] })
          .then((ls) => ls.map((l) => ({ ...l, blockNumber: BigInt(l.blockNumber), logIndex: Number(l.logIndex), transactionIndex: Number(l.transactionIndex) })))
      : [],
  ])
  const logs = [...plain, ...swaps].sort((x, y) => (x.blockNumber === y.blockNumber ? x.logIndex - y.logIndex : x.blockNumber < y.blockNumber ? -1 : 1))
  const touched = new Map() // id -> { market, block, created? }
  const ev = []
  for (const log of logs) {
    const abi = abiFor[getAddress(log.address)]
    let d
    try { d = decodeEventLog({ abi, data: log.data, topics: log.topics }) } catch { continue }
    ev.push({ log, name: d.eventName, args: d.args })
  }
  for (const { log, name, args } of ev) {
    const addr = getAddress(log.address)
    const key = `${log.transactionHash}:${log.logIndex}`
    if (ACTIVITY.has(name)) q.upsertEvent.run(key, name, Number(log.blockNumber), Number(log.logIndex), await at(log.blockNumber), log.transactionHash, jsonArgs(args))
    switch (name) {
      case 'OfferCreated':
        touched.set(String(args.id), { market: addr, block: log.blockNumber, created: { block: Number(log.blockNumber), at: await at(log.blockNumber), tx: log.transactionHash } })
        break
      case 'OptionBought':
        touched.set(String(args.id), { ...(touched.get(String(args.id)) ?? { market: addr }), block: log.blockNumber })
        q.setFees.run(String(args.fee), null, String(args.id))
        break
      case 'Exercised':
        touched.set(String(args.id), { ...(touched.get(String(args.id)) ?? { market: addr }), block: log.blockNumber })
        q.setFees.run(null, String(args.fee), String(args.id))
        break
      case 'Expired':
      case 'OfferCancelled':
        touched.set(String(args.id), { ...(touched.get(String(args.id)) ?? { market: addr }), block: log.blockNumber })
        break
      case 'Transfer': // OptionNFT: holder changed (mint/burn are covered by the market events)
        if (addr === A.nft) {
          const id = String(args.tokenId)
          const row = q.getOffer.get(id)
          if (row) touched.set(id, { market: row.market, block: log.blockNumber })
        }
        break
      case 'FeesSplit':
        q.upsertSplit.run(log.transactionHash, Number(args.epoch), Number(log.blockNumber), await at(log.blockNumber), String(args.stakers), String(args.buyback), String(args.ops))
        break
      case 'Burned':
        q.upsertBurn.run(key, log.transactionHash, Number(log.blockNumber), await at(log.blockNumber), String(args.wethIn), String(args.tokenOut))
        break
      case 'Staked':
      case 'Unstaked':
      case 'Claimed':
        q.upsertStake.run(key, log.transactionHash, getAddress(args.user), name.toLowerCase(), String(args.amount), Number(log.blockNumber), await at(log.blockNumber))
        break
      case 'AssetAdded':
      case 'AssetEnabled':
      case 'PutsEnabled':
        await refreshAsset(args.token)
        break
      case 'Swap':
        await recordSwap(log, args)
        break
    }
  }
  for (const [id, t] of touched) {
    // Position status comes from the chain, so the same log applied twice is harmless.
    const market = t.market === A.nft ? q.getOffer.get(id)?.market : t.market
    if (market) await refreshOffer(BigInt(id), market, t.block, t.created)
  }
}

async function syncOnce() {
  const head = await client.getBlock()
  const latest = head.number
  latestSeen = latest
  chainNow = Number(head.timestamp)
  const last = BigInt(q.getMeta.get('lastBlock')?.value ?? String(START_BLOCK - 1n))
  let from = last + 1n
  if (last >= START_BLOCK) from = last > REORG_DEPTH ? last - REORG_DEPTH : START_BLOCK
  if (from > latest) return
  while (from <= latest) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n
    await syncRange(from, to)
    q.setMeta.run('lastBlock', String(to))
    from = to + 1n
  }
}

// Runs beside the live sync (offers keep updating while history loads); retried until every pool is done.
async function backfillLoop() {
  try { await backfillSwaps() } catch (e) {
    console.error('[indexer] backfill error (retrying in 60s):', e.shortMessage ?? e.message)
    setTimeout(backfillLoop, 60_000)
  }
}

async function loop() {
  try { await syncOnce() } catch (e) { console.error('[indexer] sync error:', e.shortMessage ?? e.message) }
  setTimeout(loop, POLL_MS)
}

// ------------------------------------------------------------------ api
const f18 = (s) => Number(formatUnits(BigInt(s ?? 0), 18))
function offerOut(r) {
  const now = chainNow
  return {
    id: r.id, kind: r.kind, market: r.market, seller: r.seller, holder: r.holder, token: r.token, symbol: r.symbol,
    decimals: r.decimals, amount: Number(formatUnits(BigInt(r.amount), r.decimals)), amountRaw: r.amount,
    strike: f18(r.strike), strikeRaw: r.strike, premium: f18(r.premium), premiumRaw: r.premium,
    expiry: r.expiry, offerDeadline: r.deadline, status: r.status,
    fillable: r.status === 'open' && now <= r.deadline,
    premiumFee: r.premium_fee ? f18(r.premium_fee) : null, exerciseFee: r.exercise_fee ? f18(r.exercise_fee) : null,
    createdAt: r.created_at, createdTx: r.created_tx,
  }
}
const all = (sql, ...args) => db.prepare(sql).all(...args)

const routes = {
  // No RPC URL here: it can carry a provider API key.
  '/health': async () => ({
    chainId: CHAIN_ID, chainTime: chainNow, lastBlock: Number(q.getMeta.get('lastBlock')?.value ?? -1), latestBlock: Number(latestSeen),
    offers: all('SELECT COUNT(*) AS n FROM offers')[0].n, contracts: dep,
  }),
  '/assets': async () => all('SELECT * FROM assets ORDER BY symbol').map((a) => ({
    address: a.address, symbol: a.symbol, name: a.name, decimals: a.decimals, enabled: !!a.enabled, putsEnabled: !!a.puts_enabled,
    cap: a.cap, minStrike: a.min_strike,
  })),
  '/offers': async (u) => {
    const status = oneOf(u.searchParams.get('status'), ['open', 'filled', 'exercised', 'expired', 'cancelled', 'all'], 'open')
    const kind = oneOf(u.searchParams.get('kind'), ['call', 'put'], null)
    const symbol = symbolParam(u, null)
    let rows = status === 'all' ? all('SELECT * FROM offers') : all('SELECT * FROM offers WHERE status = ?', status)
    let out = rows.map(offerOut)
    if (status === 'open') out = out.filter((o) => o.fillable)
    if (kind) out = out.filter((o) => o.kind === kind)
    if (symbol) out = out.filter((o) => o.symbol === symbol)
    return out.sort((a, b) => a.expiry - b.expiry)
  },
  '/activity': async (u) => {
    const limit = intParam(u, 'limit', 30, 1, 100)
    return all('SELECT * FROM events ORDER BY block DESC, log_index DESC LIMIT ?', limit).map(describeEvent)
  },
  '/prices': async () => {
    const out = {}
    for (const sym of new Set(Object.values(POOLS).map((p) => p.symbol))) {
      const last = all('SELECT price, at FROM prices WHERE symbol = ? ORDER BY at DESC, block DESC LIMIT 1', sym)[0]
      if (!last) continue
      const ago = all('SELECT price FROM prices WHERE symbol = ? AND at <= ? ORDER BY at DESC LIMIT 1', sym, last.at - 3600)[0]
      out[sym] = { price: last.price, at: last.at, change1h: ago ? (last.price - ago.price) / ago.price : 0 }
    }
    return out
  },
  '/candles': async (u) => {
    const symbol = symbolParam(u, 'ZEPH')
    const interval = intParam(u, 'interval', 60, 10, 86_400)
    const limit = intParam(u, 'limit', 300, 1, 2000)
    const rows = all('SELECT at, price, volume_eth FROM prices WHERE symbol = ? ORDER BY at ASC, block ASC', symbol)
    const buckets = new Map()
    for (const r of rows) {
      const t = Math.floor(r.at / interval) * interval
      const c = buckets.get(t)
      if (!c) buckets.set(t, { time: t, open: r.price, high: r.price, low: r.price, close: r.price, volume: r.volume_eth })
      else { c.high = Math.max(c.high, r.price); c.low = Math.min(c.low, r.price); c.close = r.price; c.volume += r.volume_eth }
    }
    return [...buckets.values()].slice(-limit)
  },
  '/markers': async (u) => {
    const symbol = symbolParam(u, 'ZEPH')
    const ev = all("SELECT e.name, e.at, e.tx, o.kind, o.amount, o.decimals, o.strike FROM events e JOIN offers o ON o.id = json_extract(e.args, '$.id') WHERE o.symbol = ? AND e.name IN ('OptionBought','Exercised','Expired') ORDER BY e.at ASC", symbol)
    return ev.map((e) => ({ time: e.at, name: e.name, kind: e.kind, tx: e.tx, strikePerToken: f18(e.strike) / Number(formatUnits(BigInt(e.amount), e.decimals)) }))
  },
  '/expirable': async () => {
    const now = chainNow
    return all('SELECT id, market FROM offers WHERE status = ? AND expiry <= ?', 'filled', now)
  },
  '/proof': async () => {
    const splits = all('SELECT * FROM splits ORDER BY block DESC').map((s) => ({ epoch: s.epoch, at: s.at, tx: s.tx, stakers: f18(s.stakers), buyback: f18(s.buyback), ops: f18(s.ops) }))
    const burns = all('SELECT * FROM burns ORDER BY block DESC').map((b) => ({ at: b.at, tx: b.tx, wethIn: f18(b.weth_in), tokenOut: f18(b.token_out) }))
    return {
      splits, burns,
      totals: {
        split: splits.reduce((a, s) => a + s.stakers + s.buyback + s.ops, 0),
        toStakers: splits.reduce((a, s) => a + s.stakers, 0),
        burned: burns.reduce((a, b) => a + b.tokenOut, 0),
        wethBurned: burns.reduce((a, b) => a + b.wethIn, 0),
      },
    }
  },
  '/stats': cached(3_000, async () => {
    const offers = all('SELECT * FROM offers').map(offerOut)
    const settled = offers.filter((o) => ['filled', 'exercised', 'expired'].includes(o.status))
    const proof = await routes['/proof']()
    let staked = 0
    if (A.pool) {
      const [a, p] = await Promise.all([
        client.readContract({ address: A.pool, abi: ABI.pool, functionName: 'activeSupply' }),
        client.readContract({ address: A.pool, abi: ABI.pool, functionName: 'pendingSupply' }),
      ])
      staked = f18(a + p)
    }
    const net = new Map()
    for (const e of all('SELECT user, type, amount FROM stake_events')) {
      if (e.type === 'claimed') continue
      net.set(e.user, (net.get(e.user) ?? 0n) + (e.type === 'staked' ? 1n : -1n) * BigInt(e.amount))
    }
    return {
      volumeEth: settled.reduce((a, o) => a + o.premium, 0) + offers.filter((o) => o.status === 'exercised').reduce((a, o) => a + o.strike, 0),
      feesEth: offers.reduce((a, o) => a + (o.premiumFee ?? 0) + (o.exerciseFee ?? 0), 0),
      openInterestEth: offers.filter((o) => o.status === 'filled').reduce((a, o) => a + o.strike, 0),
      burnedTokens: proof.totals.burned,
      stakedTokens: staked,
      stakers: [...net.values()].filter((v) => v > 0n).length,
      activeOffers: offers.filter((o) => o.fillable).length,
      totalOffers: offers.length,
    }
  }),
}

/** Human line for the live activity feed. */
function describeEvent(e) {
  const a = JSON.parse(e.args)
  const o = a.id ? q.getOffer.get(String(a.id)) : null
  const sym = o?.symbol ?? '?'
  const amt = o ? Number(formatUnits(BigInt(o.amount), o.decimals)).toLocaleString('en-US', { maximumFractionDigits: 0 }) : ''
  const kind = o?.kind ?? 'call'
  const base = { key: e.key, name: e.name, at: e.at, tx: e.tx, kind }
  const E = (v) => `${f18(v).toLocaleString('en-US', { maximumFractionDigits: 4 })} ETH`
  switch (e.name) {
    case 'OfferCreated': return { ...base, text: `New ${kind}: ${amt} ${sym} @ ${E(a.strike)}`, sub: `premium ${E(a.premium)}` }
    case 'OptionBought': return { ...base, text: `${kind} on ${amt} ${sym} filled`, sub: `premium ${E(a.premium)}` }
    case 'Exercised': return { ...base, text: `${kind} exercised: ${amt} ${sym}`, sub: `strike ${E(a.strike)}` }
    case 'Expired': return { ...base, text: `${kind} on ${amt} ${sym} expired`, sub: 'collateral returned' }
    case 'OfferCancelled': return { ...base, text: `${kind} on ${amt} ${sym} cancelled`, sub: 'collateral returned' }
    case 'FeesSplit': return { ...base, kind: 'fee', text: `Fees split: ${E(BigInt(a.stakers) + BigInt(a.buyback) + BigInt(a.ops))}`, sub: `${E(a.stakers)} stakers · ${E(a.buyback)} burn · ${E(a.ops)} ops` }
    case 'Burned': return { ...base, kind: 'burn', text: `${f18(a.tokenOut).toLocaleString('en-US', { maximumFractionDigits: 0 })} KYTE burned`, sub: `${E(a.wethIn)} via Uniswap v4` }
    case 'Staked': return { ...base, kind: 'stake', text: `${f18(a.amount).toLocaleString('en-US', { maximumFractionDigits: 0 })} KYTE staked`, sub: `active from epoch ${a.activeFromEpoch}` }
    case 'Unstaked': return { ...base, kind: 'stake', text: `${f18(a.amount).toLocaleString('en-US', { maximumFractionDigits: 0 })} KYTE unstaked`, sub: '' }
    case 'Claimed': return { ...base, kind: 'stake', text: `${E(a.amount)} rewards claimed`, sub: '' }
    default: return { ...base, text: e.name, sub: '' }
  }
}

// ------------------------------------------------------------------ request hardening
class BadRequest extends Error {}
function oneOf(v, allowed, dflt) {
  if (v == null) return dflt
  if (!allowed.includes(v)) throw new BadRequest(`expected one of ${allowed.join(', ')}`)
  return v
}
function intParam(u, name, dflt, min, max) {
  const raw = u.searchParams.get(name)
  if (raw == null) return dflt
  if (!/^\d{1,9}$/.test(raw)) throw new BadRequest(`${name} must be an integer`)
  return Math.min(max, Math.max(min, Number(raw)))
}
function symbolParam(u, dflt) {
  const v = u.searchParams.get('token')
  if (v == null) return dflt
  if (!/^[A-Za-z0-9]{1,16}$/.test(v)) throw new BadRequest('bad token symbol')
  return v
}
function addressParam(v) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new BadRequest('bad address')
  return getAddress(v.toLowerCase())
}
/** Short TTL cache so a flood of requests can't be turned into a flood of RPC calls. */
function cached(ttlMs, fn, maxKeys = 5_000) {
  const store = new Map()
  const inflight = new Map()
  return async (arg, key = '') => {
    const hit = store.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value
    if (inflight.has(key)) return inflight.get(key) // concurrent misses share one RPC round
    const p = Promise.resolve(fn(arg, key)).finally(() => inflight.delete(key))
    inflight.set(key, p)
    const value = await p
    if (store.size >= maxKeys) store.delete(store.keys().next().value)
    store.set(key, { at: Date.now(), value })
    return value
  }
}
// Fixed window per client IP.
const hits = new Map()
setInterval(() => hits.clear(), 60_000).unref()
function clientIp(req) {
  const fwd = TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : ''
  return fwd || req.socket.remoteAddress || '?'
}
function overLimit(req) {
  const ip = clientIp(req)
  const n = (hits.get(ip) ?? 0) + 1
  hits.set(ip, n)
  return n > RATE_LIMIT
}

const stakeOf = cached(4_000, async (addr) => {
  const r = (fn, args) => client.readContract({ address: A.pool, abi: ABI.pool, functionName: fn, args })
  const [[active, pending], claimable, epoch, ends, minClaim, totalActive, totalPending] = await Promise.all([
    r('balancesOf', [addr]), r('pendingRewards', [addr]), r('currentEpoch'), r('epochEndsAt'), r('minClaim'), r('activeSupply'), r('pendingSupply'),
  ])
  const last = all('SELECT stakers FROM splits ORDER BY block DESC LIMIT 1')[0]
  return {
    myActive: f18(active), myPending: f18(pending), claimable: f18(claimable), epoch: Number(epoch), epochEndsAt: Number(ends),
    minClaim: f18(minClaim), totalStaked: f18(totalActive + totalPending), lastEpochRewards: last ? f18(last.stakers) : 0,
  }
})

function send(res, status, body) {
  res.statusCode = status
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('cache-control', 'no-store')
  const origin = req.headers.origin
  if (!CORS_ORIGINS.length) res.setHeader('access-control-allow-origin', '*')
  else if (origin && CORS_ORIGINS.includes(origin)) { res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'origin') }
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return send(res, 204, '')
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' })
  if ((req.url ?? '').length > 2048) return send(res, 414, { error: 'uri too long' })
  if (overLimit(req)) { res.setHeader('retry-after', '60'); return send(res, 429, { error: 'rate limited' }) }

  try {
    const u = new URL(req.url, 'http://x')
    let body
    const m = u.pathname.match(/^\/(offers|positions|stake)\/([^/]+)$/)
    if (Object.hasOwn(routes, u.pathname)) body = await routes[u.pathname](u)
    else if (m?.[1] === 'offers') {
      if (!/^\d{1,80}$/.test(m[2])) throw new BadRequest('bad id')
      const r = q.getOffer.get(m[2])
      if (!r) return send(res, 404, { error: 'not found' })
      body = offerOut(r)
    } else if (m?.[1] === 'positions') {
      const addr = addressParam(m[2])
      body = {
        holding: all('SELECT * FROM offers WHERE holder = ? AND status = ?', addr, 'filled').map(offerOut),
        selling: all('SELECT * FROM offers WHERE seller = ? AND status IN (?, ?)', addr, 'open', 'filled').map(offerOut),
        history: all('SELECT * FROM offers WHERE (seller = ? OR holder = ?) AND status IN (?, ?, ?) ORDER BY updated_block DESC LIMIT 50', addr, addr, 'exercised', 'expired', 'cancelled').map(offerOut),
      }
    } else if (m?.[1] === 'stake') {
      if (!A.pool) return send(res, 404, { error: 'no staking pool' })
      const addr = addressParam(m[2])
      body = await stakeOf(addr, addr)
    } else return send(res, 404, { error: 'not found' })
    send(res, 200, body)
  } catch (e) {
    if (e instanceof BadRequest) return send(res, 400, { error: e.message })
    // Never echo internals (RPC URLs, stack traces) to the public.
    console.error('[indexer] request failed:', req.url, e.shortMessage ?? e.message)
    send(res, 500, { error: 'internal error' })
  }
})
server.headersTimeout = 10_000
server.requestTimeout = 15_000
server.maxHeadersCount = 50

// The deployment file and the RPC must describe the same chain.
const rpcChain = await client.getChainId()
if (rpcChain !== CHAIN_ID) throw new Error(`RPC is chain ${rpcChain}, expected ${CHAIN_ID}`)

await refreshAllAssets()
await syncOnce()
server.listen(PORT, HOST, () => console.log(`[indexer] chain ${CHAIN_ID} → http://${HOST}:${PORT}`))
loop()
backfillLoop()
