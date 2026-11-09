// FOBO launchpad (fobo.fun) on Robinhood Chain: every token launches with its whole supply as Uniswap v4 liquidity
// owned by FoboHook, and a floor (a wall of buy liquidity under the price) that only rises. There is no graduation.
// Kyte's bar for a FOBO token is the floor itself: quoted in ETH, at least FOBO_MIN_AGE old, and the floor backs at
// least FOBO_MIN_FLOOR_ETH for the tokens in circulation (the same 4.2 ETH bar Pons graduation uses). This module
// indexes FoboFactory's TokenLaunched logs, polls FoboHook.floorOf, prices tokens from DexScreener and serves
// /fobo/tokens. FoboLister (contracts/src/FoboLister.sol) enforces the same bar on chain when the keeper lists.
import { encodeAbiParameters, getAddress, keccak256, parseAbi, parseAbiItem } from 'viem'

export const FOBO_FACTORY = '0xd7e538e98A208fD19e46bc549FF4710C33664e18'
export const FOBO_HOOK = '0x0Af57F62982D03066ef917AcAd87F771c06528Ec'
export const FOBO_TOKEN = '0x000DE658153f47f23e92973C8EB1e89762703676'
const FROM_BLOCK = 98_573_000n // $FOBO itself launched at 98,573,047 (26 Oct 2026)
const TICK_SPACING = 60
const ZERO = '0x0000000000000000000000000000000000000000'
const Q96 = 1n << 96n

const LAUNCHED = parseAbiItem('event TokenLaunched(address indexed token, bytes32 indexed poolId, address indexed creator, address quote, int24 tickStart, uint256 devBuyTokens, string name, string ticker, string metadataURI)')
const HOOK_ABI = parseAbi([
  'function floorOf((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key) view returns (int24 tickF, uint160 sqrtPriceX96, uint256 circulating)',
  'function pools(bytes32 id) view returns (address token, address creator, uint40 launchedAt, int24 tickStart, int24 tickF, int24 refTick, uint64 refBlock, uint64 lastRaiseBlock, uint128 snipePot, uint128 snipeReleased, uint8 merged, uint128 liqBand, uint256 pot, uint256 creatorOwed, uint256 reserve)',
])
const TOKEN_ABI = parseAbi(['function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)'])
const LISTER_ABI = parseAbi(['function operationOf(address token) view returns (bytes32)'])
const ZERO32 = '0x' + '0'.repeat(64)

export const MIN_AGE_SEC = Number(process.env.FOBO_MIN_AGE || 86_400)
export const MIN_FLOOR_ETH = Number(process.env.FOBO_MIN_FLOOR_ETH || 4.2)
const FLOOR_POLL_MS = Number(process.env.FOBO_POLL_MS || 120_000)
const QUOTE_MS = Number(process.env.FOBO_QUOTE_MS || 60_000)
const WINDOW_H = 72 // recent launches shown and floor-polled for three days; eligible and listed tokens for ever
const SWEEP = 60 // older ETH-quoted tokens re-checked per cycle (a floor can grow months after launch)
const STR_MAX = 200
const clean = (s) => String(s ?? '').replace(/[^\x20-\x7E -￿]/g, '').slice(0, STR_MAX)

/** The v4 pool key FoboHook uses for an ETH-quoted token, and its id. */
export function keyFor(token, quote = ZERO) {
  return { currency0: quote, currency1: token, fee: 0, tickSpacing: TICK_SPACING, hooks: FOBO_HOOK }
}
const KEY_T = [{ type: 'tuple', components: [{ type: 'address', name: 'currency0' }, { type: 'address', name: 'currency1' }, { type: 'uint24', name: 'fee' }, { type: 'int24', name: 'tickSpacing' }, { type: 'address', name: 'hooks' }] }]
export const poolIdOf = (key) => keccak256(encodeAbiParameters(KEY_T, [key]))

/** ETH per token at the floor's worst-case price (v4 price is token per ETH = (sqrtP / 2^96)^2). */
export const floorEthPerToken = (sqrtP) => (sqrtP === 0n ? 0 : Number((Q96 * Q96 * 10n ** 18n) / (sqrtP * sqrtP)) / 1e18)
/** Wei of ETH the floor pays for `circulating` token wei: circulating * 2^192 / sqrtP^2 (FoboLister.floorBacking). */
export const floorBackingWei = (sqrtP, circulating) => (sqrtP === 0n ? 0n : (((circulating * Q96) / sqrtP) * Q96) / sqrtP)

/** deps: { db, all, client, lister?, log }; returns { route, start, floorFor, onTokens } */
export function installFobo({ db, all, client, lister = null, log = console.log }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fobo_tokens (address TEXT PRIMARY KEY, symbol TEXT, name TEXT, decimals INTEGER, supply TEXT, metadata_uri TEXT,
      creator TEXT, quote TEXT, pool_id TEXT, tick_start INTEGER, launch_block INTEGER, launched_at INTEGER, launch_tx TEXT,
      floor_tick INTEGER, floor_sqrt TEXT, floor_eth REAL, backing_eth REAL, circulating TEXT, eligible INTEGER DEFAULT 0, eligible_at INTEGER, checked_at INTEGER,
      price_usd REAL, price_eth REAL, mcap_usd REAL, change24h REAL, liquidity_usd REAL, volume24h_usd REAL, quoted_at INTEGER, dex_url TEXT);
    CREATE INDEX IF NOT EXISTS fobo_tokens_elig ON fobo_tokens(eligible, backing_eth DESC);
    CREATE INDEX IF NOT EXISTS fobo_tokens_launched ON fobo_tokens(launched_at DESC);
    CREATE INDEX IF NOT EXISTS fobo_tokens_checked ON fobo_tokens(quote, checked_at);
  `)
  const tryExec = (sql) => { try { db.exec(sql) } catch {} }
  for (const col of ['logo TEXT', 'description TEXT', 'socials TEXT', 'meta_fetched_at INTEGER']) tryExec(`ALTER TABLE fobo_tokens ADD COLUMN ${col}`)
  const setMetaData = db.prepare('UPDATE fobo_tokens SET logo = COALESCE(?, logo), description = COALESCE(?, description), socials = COALESCE(?, socials), meta_fetched_at = ? WHERE address = ?')
  const ins = db.prepare(`INSERT OR IGNORE INTO fobo_tokens(address, symbol, name, decimals, supply, metadata_uri, creator, quote, pool_id, tick_start, launch_block, launched_at, launch_tx)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  const setFloor = db.prepare('UPDATE fobo_tokens SET floor_tick = ?, floor_sqrt = ?, floor_eth = ?, backing_eth = ?, circulating = ?, eligible = ?, eligible_at = CASE WHEN ? = 1 THEN COALESCE(eligible_at, ?) ELSE eligible_at END, checked_at = ? WHERE address = ?')
  const touch = db.prepare('UPDATE fobo_tokens SET checked_at = ? WHERE address = ?')
  const setQuote = db.prepare('UPDATE fobo_tokens SET price_usd = ?, price_eth = ?, mcap_usd = ?, change24h = ?, liquidity_usd = ?, volume24h_usd = ?, quoted_at = ?, dex_url = ? WHERE address = ?')
  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?')
  const setMeta = db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

  const listeners = []
  // eligible tokens and the ones already on Kyte: the set index.mjs tags as source 'fobo' (24 h options, floor shown)
  const notify = () => { const set = new Set(all('SELECT address FROM fobo_tokens WHERE eligible = 1 OR lower(address) IN (SELECT lower(address) FROM assets)').map((r) => r.address.toLowerCase())); for (const fn of listeners) fn(set) }
  const blockTime = new Map()
  async function at(block) {
    const k = String(block)
    if (!blockTime.has(k)) blockTime.set(k, Number((await client.getBlock({ blockNumber: block })).timestamp))
    return blockTime.get(k)
  }

  // ---- launches: TokenLaunched logs, resumable through meta fobo:cursor
  async function syncLaunches(head) {
    const key = 'fobo:cursor'
    let from = BigInt(getMeta.get(key)?.value ?? String(FROM_BLOCK - 1n)) + 1n
    let span = 250_000n
    while (from <= head) {
      const to = from + span - 1n > head ? head : from + span - 1n
      let logs
      try {
        logs = await client.getLogs({ address: FOBO_FACTORY, event: LAUNCHED, fromBlock: from, toBlock: to })
      } catch (e) {
        if (e.status === 429 || /rate limit/i.test(`${e.details ?? ''} ${e.message ?? ''}`)) { await new Promise((r) => setTimeout(r, 61_000)); continue }
        if (span <= 5_000n) throw e
        span /= 4n; continue
      }
      for (const l of logs) {
        const a = l.args
        const token = getAddress(a.token)
        const [decimals, supply] = await Promise.all([
          client.readContract({ address: token, abi: TOKEN_ABI, functionName: 'decimals' }).catch(() => 18),
          client.readContract({ address: token, abi: TOKEN_ABI, functionName: 'totalSupply' }).catch(() => 0n),
        ])
        ins.run(token, clean(a.ticker).slice(0, 16), clean(a.name), Number(decimals), String(supply), clean(a.metadataURI).slice(0, 400), getAddress(a.creator), getAddress(a.quote), a.poolId, Number(a.tickStart), Number(l.blockNumber), await at(l.blockNumber), l.transactionHash)
      }
      if (logs.length) log(`[fobo] ${logs.length} launches in blocks ${from}-${to}`)
      setMeta.run(key, String(to))
      from = to + 1n
    }
  }

  // ---- floors: FoboHook.floorOf for ETH-quoted tokens. Recent launches, eligible and listed tokens every cycle,
  // plus a slow sweep of the rest (a floor only rises, so a token can clear the bar long after launch).
  async function checkFloor(r, now) {
    try {
      const key = keyFor(r.address)
      const [tickF, sqrtP, circulating] = await client.readContract({ address: FOBO_HOOK, abi: HOOK_ABI, functionName: 'floorOf', args: [key] })
      const backing = Number(floorBackingWei(sqrtP, circulating)) / 1e18
      const eligible = now - r.launched_at >= MIN_AGE_SEC && backing >= MIN_FLOOR_ETH ? 1 : 0
      setFloor.run(Number(tickF), String(sqrtP), floorEthPerToken(sqrtP), backing, String(circulating), eligible, eligible, now, now, r.address)
      if (eligible && !r.eligible) { log(`[fobo] clears the bar: ${r.symbol} ${r.address} (floor backs ${backing.toFixed(2)} ETH)`); return 1 }
      if (!eligible && r.eligible) log(`[fobo] below the bar again: ${r.symbol} ${r.address} (${backing.toFixed(2)} ETH)`)
    } catch (e) {
      touch.run(now, r.address)
    }
    return 0
  }
  async function pollFloors() {
    const now = Math.floor(Date.now() / 1000)
    const seen = new Set()
    const queue = []
    const add = (rows) => { for (const r of rows) { const k = r.address.toLowerCase(); if (!seen.has(k)) { seen.add(k); queue.push(r) } } }
    add(all('SELECT address, symbol, launched_at, eligible FROM fobo_tokens WHERE quote = ? AND (launched_at >= ? OR eligible = 1 OR lower(address) IN (SELECT lower(address) FROM assets))', ZERO, now - WINDOW_H * 3600))
    add(all('SELECT address, symbol, launched_at, eligible FROM fobo_tokens WHERE quote = ? AND checked_at IS NULL LIMIT ?', ZERO, SWEEP))
    add(all('SELECT address, symbol, launched_at, eligible FROM fobo_tokens WHERE quote = ? ORDER BY checked_at ASC LIMIT ?', ZERO, SWEEP))
    let changed = 0
    for (let i = 0; i < queue.length; i += 8) changed += (await Promise.all(queue.slice(i, i + 8).map((r) => checkFloor(r, now)))).reduce((x, y) => x + y, 0)
    notify()
    return changed
  }

  // ---- lister state: which eligible, unlisted tokens have a listing scheduled in the timelock
  const scheduled = new Set()
  async function refreshScheduled() {
    if (!lister) return
    const listed = new Set(all('SELECT address FROM assets').map((a) => a.address.toLowerCase()))
    for (const r of all('SELECT address FROM fobo_tokens WHERE eligible = 1')) {
      if (listed.has(r.address.toLowerCase())) { scheduled.delete(r.address.toLowerCase()); continue }
      const op = await client.readContract({ address: lister, abi: LISTER_ABI, functionName: 'operationOf', args: [r.address] }).catch(() => ZERO32)
      if (op !== ZERO32) scheduled.add(r.address.toLowerCase()); else scheduled.delete(r.address.toLowerCase())
    }
  }

  // ---- metadata: the launch's metadataURI (https://images.fobo.fun/tokens/meta-<id>.json: { name, symbol, image, links })
  // for recent, eligible and listed tokens; $FOBO's own URI is a placeholder (ipfs://fobo), so DexScreener's token
  // image and links fill the gaps below. Only https URLs are fetched, 32 KB cap, images must be https too.
  const META_HOSTS = /^https:\/\/(images\.fobo\.fun|fobo\.fun)\//
  const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"']+$/.test(u) ? u.slice(0, 300) : null)
  const linksOf = (links) => {
    const out = []
    const push = (type, url) => { const u = httpsUrl(url); if (u) out.push({ type: String(type).toLowerCase().replace(/^x$/, 'twitter').slice(0, 20), url: u }) }
    if (Array.isArray(links)) for (const l of links) push(l?.type ?? l?.label ?? 'website', l?.url ?? l)
    else if (links && typeof links === 'object') for (const [k, v] of Object.entries(links)) push(k, v)
    return out.slice(0, 8)
  }
  async function fetchMeta(r, now) {
    let logo = null, description = null, socials = null
    if (META_HOSTS.test(r.metadata_uri ?? '')) {
      try {
        const res = await fetch(r.metadata_uri, { signal: AbortSignal.timeout(8_000), headers: { accept: 'application/json' } })
        if (res.ok) {
          const text = (await res.text()).slice(0, 32 * 1024)
          const j = JSON.parse(text)
          logo = httpsUrl(j.image ?? j.logo ?? j.imageUrl)
          description = typeof j.description === 'string' ? j.description.replace(/[^\x20-\x7E\u00A0-\uFFFF\n]/g, '').slice(0, 600) : null
          const ls = linksOf(j.links ?? j.socials)
          socials = ls.length ? JSON.stringify(ls) : null
        }
      } catch (e) { log(`[fobo] metadata ${r.symbol}: ${e.message}`) }
    }
    setMetaData.run(logo, description, socials, now, r.address)
  }
  async function pollMeta() {
    const now = Math.floor(Date.now() / 1000)
    // listed and eligible tokens first (they are on the site), then the newest launches
    const rows = all('SELECT address, symbol, metadata_uri FROM fobo_tokens WHERE meta_fetched_at IS NULL AND (eligible = 1 OR launched_at >= ? OR lower(address) IN (SELECT lower(address) FROM assets)) ORDER BY (lower(address) IN (SELECT lower(address) FROM assets)) DESC, eligible DESC, launched_at DESC LIMIT 100', now - WINDOW_H * 3600)
    for (let i = 0; i < rows.length; i += 6) await Promise.all(rows.slice(i, i + 6).map((r) => fetchMeta(r, now)))
    return rows.length
  }

  // ---- quotes: DexScreener (it indexes the FoboHook pools), 30 addresses per call
  async function quote() {
    await refreshScheduled().catch((e) => log(`[fobo] lister: ${e.shortMessage ?? e.message}`))
    const rows = all('SELECT address FROM fobo_tokens WHERE eligible = 1 OR launched_at >= ? OR backing_eth >= ? OR lower(address) IN (SELECT lower(address) FROM assets) ORDER BY quoted_at ASC LIMIT 150', Math.floor(Date.now() / 1000) - WINDOW_H * 3600, MIN_FLOOR_ETH / 2)
    const now = Math.floor(Date.now() / 1000)
    for (let i = 0; i < rows.length; i += 30) {
      const chunk = rows.slice(i, i + 30)
      let pairs
      try {
        const r = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${chunk.map((x) => x.address).join(',')}`, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        pairs = await r.json()
      } catch (e) { log(`[fobo] dexscreener: ${e.message}`); continue }
      const best = new Map()
      for (const p of Array.isArray(pairs) ? pairs : []) {
        const addr = getAddress(p.baseToken?.address ?? ZERO)
        const liq = Number(p.liquidity?.usd ?? 0)
        if (!best.has(addr) || liq > best.get(addr).liq) best.set(addr, { liq, p })
      }
      for (const { p, liq } of best.values()) {
        const addr = getAddress(p.baseToken.address)
        setQuote.run(Number(p.priceUsd ?? 0), Number(p.priceNative ?? 0), Number(p.marketCap ?? p.fdv ?? 0), Number(p.priceChange?.h24 ?? 0), liq, Number(p.volume?.h24 ?? 0), now, typeof p.url === 'string' ? p.url.slice(0, 200) : null, addr)
        // fills whatever the launch metadata did not have (logo, links); never overwrites it (COALESCE keeps existing)
        const dsLinks = [...(p.info?.websites ?? []).map((w) => ({ type: 'website', url: w.url })), ...(p.info?.socials ?? []).map((s) => ({ type: s.type, url: s.url }))]
        const ls = linksOf(dsLinks)
        if (httpsUrl(p.info?.imageUrl) || ls.length) db.prepare('UPDATE fobo_tokens SET logo = COALESCE(logo, ?), socials = COALESCE(socials, ?) WHERE address = ?').run(httpsUrl(p.info?.imageUrl), ls.length ? JSON.stringify(ls) : null, addr)
      }
    }
  }

  /** Logos of the given tokens (checksummed addresses), by primary key. */
  function logosOf(addresses) {
    const out = new Map()
    for (let i = 0; i < addresses.length; i += 200) {
      const chunk = addresses.slice(i, i + 200).map((a) => getAddress(a))
      for (const r of all(`SELECT address, logo FROM fobo_tokens WHERE logo IS NOT NULL AND address IN (${chunk.map(() => '?').join(',')})`, ...chunk)) out.set(r.address.toLowerCase(), r.logo)
    }
    return out
  }

  /** The floor of a FOBO token Kyte knows (for /prices, the market and sell pages): ETH per token and what it backs. */
  function floorFor(address) {
    const r = all('SELECT floor_eth, backing_eth, floor_tick, checked_at FROM fobo_tokens WHERE address = ?', getAddress(address))[0]
    if (!r || r.floor_eth == null) return null
    return { floorEth: r.floor_eth, backingEth: r.backing_eth, tickF: r.floor_tick, at: r.checked_at }
  }

  function out(r, listed) {
    const k = listed.get(r.address.toLowerCase())
    const quoteIsEth = r.quote.toLowerCase() === ZERO
    const now = Math.floor(Date.now() / 1000)
    return {
      address: r.address, symbol: r.symbol, name: r.name, decimals: r.decimals, metadataUri: r.metadata_uri || null,
      logo: r.logo || null, description: r.description || null, socials: (() => { try { return JSON.parse(r.socials || '[]') } catch { return [] } })(),
      creator: r.creator, quote: r.quote, quoteIsEth, poolId: r.pool_id,
      launchedAt: r.launched_at, launchTx: r.launch_tx, ageSec: Math.max(0, now - r.launched_at),
      floorEth: r.floor_eth, floorBackingEth: r.backing_eth, circulating: r.circulating ? Number(r.circulating) / 10 ** (r.decimals || 18) : null,
      floorVsPrice: r.floor_eth && r.price_eth ? r.floor_eth / r.price_eth - 1 : null,
      progress: r.backing_eth == null ? null : Math.min(1, r.backing_eth / MIN_FLOOR_ETH), barEth: MIN_FLOOR_ETH, minAgeSec: MIN_AGE_SEC,
      eligible: !!r.eligible, eligibleAt: r.eligible_at, checkedAt: r.checked_at,
      priceUsd: r.price_usd, priceEth: r.price_eth, mcapUsd: r.mcap_usd, change24h: r.change24h, liquidityUsd: r.liquidity_usd, volume24hUsd: r.volume24h_usd, quotedAt: r.quoted_at,
      kyte: k ? (k.enabled ? 'listed' : 'disabled') : scheduled.has(r.address.toLowerCase()) ? 'scheduled' : 'unlisted',
      supply: r.supply ? Number(r.supply) / 10 ** (r.decimals || 18) : null,
      links: {
        fobo: `https://fobo.fun/?token=${r.address.toLowerCase()}`,
        dexscreener: r.dex_url || `https://dexscreener.com/robinhood/${r.address.toLowerCase()}`,
        token: `https://robin.etherscan.io/token/${r.address}`,
        hook: `https://robin.etherscan.io/address/${FOBO_HOOK}`,
        creator: `https://robin.etherscan.io/address/${r.creator}`,
        launchTx: `https://robin.etherscan.io/tx/${r.launch_tx}`,
      },
      foboUrl: `https://fobo.fun/?token=${r.address.toLowerCase()}`,
    }
  }

  /** GET /fobo/tokens?status=recent|eligible|near|listed|all&hours=1..72&limit=N */
  async function route(u) {
    const status = u.searchParams.get('status') ?? 'eligible'
    const limit = Math.min(500, Math.max(1, Number(u.searchParams.get('limit') ?? 200) || 200))
    const hours = Math.min(WINDOW_H, Math.max(1, Number(u.searchParams.get('hours') ?? WINDOW_H) || WINDOW_H))
    const listed = new Map(all('SELECT address, enabled FROM assets').map((a) => [a.address.toLowerCase(), a]))
    let rows
    if (status === 'recent') rows = all('SELECT * FROM fobo_tokens WHERE launched_at >= ? ORDER BY launched_at DESC LIMIT ?', Math.floor(Date.now() / 1000) - hours * 3600, limit)
    else if (status === 'eligible') rows = all('SELECT * FROM fobo_tokens WHERE eligible = 1 ORDER BY backing_eth DESC LIMIT ?', limit)
    else if (status === 'near') rows = all('SELECT * FROM fobo_tokens WHERE eligible = 0 AND quote = ? AND backing_eth >= ? ORDER BY backing_eth DESC LIMIT ?', ZERO, MIN_FLOOR_ETH / 2, limit)
    else if (status === 'listed') rows = all('SELECT * FROM fobo_tokens WHERE lower(address) IN (SELECT lower(address) FROM assets) ORDER BY mcap_usd DESC LIMIT ?', limit)
    else rows = all('SELECT * FROM fobo_tokens ORDER BY launched_at DESC LIMIT ?', limit)
    const total = all('SELECT COUNT(*) AS n, SUM(eligible) AS e, SUM(CASE WHEN quote = ? THEN 1 ELSE 0 END) AS eth FROM fobo_tokens', ZERO)[0]
    return { tokens: rows.map((r) => out(r, listed)), counts: { launched: total.n, ethQuoted: total.eth ?? 0, eligible: total.e ?? 0 }, rule: { minAgeSec: MIN_AGE_SEC, minFloorEth: MIN_FLOOR_ETH, quote: 'ETH', maxOptionExpirySec: 86_400 }, hours }
  }

  function start() {
    const launchLoop = async () => {
      try { await syncLaunches((await client.getBlock()).number) } catch (e) { log(`[fobo] launches: ${e.shortMessage ?? e.message}`) }
      setTimeout(launchLoop, 30_000).unref?.()
    }
    const floorLoop = async () => {
      try { await pollFloors() } catch (e) { log(`[fobo] floors: ${e.shortMessage ?? e.message}`) }
      setTimeout(floorLoop, FLOOR_POLL_MS).unref?.()
    }
    const quoteLoop = async () => {
      try { await quote() } catch (e) { log(`[fobo] quote: ${e.message}`) }
      setTimeout(quoteLoop, QUOTE_MS).unref?.()
    }
    const metaLoop = async () => {
      try { await pollMeta() } catch (e) { log(`[fobo] metadata: ${e.message}`) }
      setTimeout(metaLoop, 120_000).unref?.()
    }
    setTimeout(launchLoop, 7_000).unref?.()
    setTimeout(floorLoop, 25_000).unref?.()
    setTimeout(quoteLoop, 45_000).unref?.()
    setTimeout(metaLoop, 35_000).unref?.()
  }

  return { route, start, syncLaunches, pollFloors, pollMeta, quote, floorFor, logosOf, onTokens(fn) { listeners.push(fn); notify() } }
}
