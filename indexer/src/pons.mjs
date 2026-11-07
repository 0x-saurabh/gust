// Pons launchpad (ponsfamily.com) on Robinhood Chain: every token launches straight into a locked Uniswap V3 pool
// against a pair token; "graduated" means the pool's paired principal crossed the factory threshold (4.2 ETH by
// default). No API exists, so this module indexes the factory's TokenLaunched logs, polls graduationStatus, and
// serves /pons/tokens with price and market cap from DexScreener plus the token's state on Kyte.
import { getAddress, parseAbi, parseAbiItem } from 'viem'

const FACTORIES = [
  { address: '0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB', fromBlock: 8_991_118n, legacy: false },
  { address: '0x0c37a24F5D23A486FA692d1500881d698B1F77a4', fromBlock: 8_600_612n, legacy: true },
]
export const PONS_WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'
export const PONS_FACTORY = FACTORIES[0].address
export const PONS_LOCKER = '0x736D76699C26D0d966744cAe304C000d471f7F35'
const LAUNCHED = parseAbiItem('event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)')
const FACTORY_ABI = parseAbi(['function graduationStatus(address token) view returns (uint256 pairedPrincipal, uint256 threshold, bool graduated)'])
const TOKEN_ABI = parseAbi(['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)', 'function logo() view returns (string)', 'function description() view returns (string)'])

const GRAD_POLL_MS = Number(process.env.PONS_POLL_MS || 120_000)
const QUOTE_MS = Number(process.env.PONS_QUOTE_MS || 60_000)
const RECENT_MAX_H = 168 // 'recent' window: ?hours=24|36|…, up to a week
const STR_MAX = 200

// Pons stores logos as ipfs:// URIs; serve them through a public gateway.
const logoUrl = (v) => (!v ? null : v.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${v.slice(7)}` : /^https?:\/\//.test(v) ? v : null)
const clean = (s) => String(s ?? '').replace(/[^\x20-\x7E -￿]/g, '').slice(0, STR_MAX)

/** deps: { db, all, client, log }; returns { route, start } */
export function installPons({ db, all, client, log = console.log }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pons_tokens (address TEXT PRIMARY KEY, symbol TEXT, name TEXT, decimals INTEGER, supply TEXT, logo TEXT, description TEXT,
      deployer TEXT, pair_token TEXT, pool TEXT, factory TEXT, legacy INTEGER, launch_block INTEGER, launched_at INTEGER, launch_tx TEXT,
      paired_principal TEXT, threshold TEXT, graduated INTEGER DEFAULT 0, graduated_at INTEGER, checked_at INTEGER,
      price_usd REAL, price_eth REAL, mcap_usd REAL, change24h REAL, liquidity_usd REAL, volume24h_usd REAL, quoted_at INTEGER);
    CREATE INDEX IF NOT EXISTS pons_tokens_grad ON pons_tokens(graduated, graduated_at DESC);
  `)
  const ins = db.prepare(`INSERT OR IGNORE INTO pons_tokens(address, symbol, name, decimals, supply, logo, description, deployer, pair_token, pool, factory, legacy, launch_block, launched_at, launch_tx)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  const setGrad = db.prepare('UPDATE pons_tokens SET paired_principal = ?, threshold = ?, graduated = ?, graduated_at = COALESCE(graduated_at, ?), checked_at = ? WHERE address = ?')
  const setQuote = db.prepare('UPDATE pons_tokens SET price_usd = ?, price_eth = ?, mcap_usd = ?, change24h = ?, liquidity_usd = ?, volume24h_usd = ?, quoted_at = ? WHERE address = ?')
  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?')
  const setMeta = db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

  const listeners = []
  const notify = () => { const set = new Set(all('SELECT address FROM pons_tokens').map((r) => r.address.toLowerCase())); for (const fn of listeners) fn(set) }
  const blockTime = new Map()
  async function at(block) {
    const k = String(block)
    if (!blockTime.has(k)) blockTime.set(k, Number((await client.getBlock({ blockNumber: block })).timestamp))
    return blockTime.get(k)
  }
  async function meta(token) {
    const read = (fn) => client.readContract({ address: token, abi: TOKEN_ABI, functionName: fn }).catch(() => undefined)
    const [name, symbol, decimals, supply, logo, description] = await Promise.all(['name', 'symbol', 'decimals', 'totalSupply', 'logo', 'description'].map(read))
    return { name: clean(name), symbol: clean(symbol).slice(0, 16), decimals: Number(decimals ?? 18), supply: String(supply ?? ''), logo: clean(logo).slice(0, 400), description: clean(description) }
  }

  // ---- launches: TokenLaunched logs per factory, resumable through meta pons:cursor:<factory>
  async function syncLaunches(head) {
    for (const f of FACTORIES) {
      const key = `pons:cursor:${f.address.toLowerCase()}`
      let from = BigInt(getMeta.get(key)?.value ?? String(f.fromBlock - 1n)) + 1n
      let span = 500_000n
      while (from <= head) {
        const to = from + span - 1n > head ? head : from + span - 1n
        let logs
        try {
          logs = await client.getLogs({ address: f.address, event: LAUNCHED, fromBlock: from, toBlock: to })
        } catch (e) {
          if (e.status === 429 || /rate limit/i.test(`${e.details ?? ''} ${e.message ?? ''}`)) { await new Promise((r) => setTimeout(r, 61_000)); continue }
          if (span <= 5_000n) throw e
          span /= 4n; continue
        }
        for (const l of logs) {
          const a = l.args
          const token = getAddress(a.token)
          const m = await meta(token)
          ins.run(token, m.symbol, m.name, m.decimals, m.supply, m.logo, m.description, getAddress(a.deployer), getAddress(a.pairToken), getAddress(a.pool), f.address, f.legacy ? 1 : 0, Number(l.blockNumber), await at(l.blockNumber), l.transactionHash)
        }
        if (logs.length) { notify(); log(`[pons] ${logs.length} launches in blocks ${from}-${to}${f.legacy ? ' (legacy factory)' : ''}`) }
        setMeta.run(key, String(to))
        from = to + 1n
      }
    }
  }

  // ---- graduation: poll the factory for tokens not yet graduated (and refresh graduated ones rarely)
  async function pollGraduation() {
    const now = Math.floor(Date.now() / 1000)
    const rows = all('SELECT address, factory, graduated, checked_at FROM pons_tokens WHERE graduated = 0 OR checked_at IS NULL OR checked_at < ? ORDER BY checked_at ASC LIMIT 400', now - 6 * 3600)
    let newly = 0
    for (const r of rows) {
      try {
        const [paired, threshold, graduated] = await client.readContract({ address: r.factory, abi: FACTORY_ABI, functionName: 'graduationStatus', args: [r.address] })
        setGrad.run(String(paired), String(threshold), graduated ? 1 : 0, graduated ? now : null, now, r.address)
        if (graduated && !r.graduated) { newly += 1; log(`[pons] graduated: ${r.address}`) }
      } catch (e) {
        setGrad.run(null, null, r.graduated, null, now, r.address)
      }
    }
    return newly
  }

  // ---- quotes: DexScreener, 30 addresses per call, graduated tokens first
  async function quote() {
    const rows = all('SELECT address FROM pons_tokens ORDER BY graduated DESC, quoted_at ASC LIMIT 150')
    const now = Math.floor(Date.now() / 1000)
    for (let i = 0; i < rows.length; i += 30) {
      const chunk = rows.slice(i, i + 30)
      let pairs
      try {
        const r = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${chunk.map((x) => x.address).join(',')}`, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        pairs = await r.json()
      } catch (e) { log(`[pons] dexscreener: ${e.message}`); continue }
      const best = new Map()
      for (const p of Array.isArray(pairs) ? pairs : []) {
        const addr = getAddress(p.baseToken?.address ?? '0x0000000000000000000000000000000000000000')
        const liq = Number(p.liquidity?.usd ?? 0)
        if (!best.has(addr) || liq > best.get(addr).liq) best.set(addr, { liq, p })
      }
      for (const { p, liq } of best.values()) {
        const addr = getAddress(p.baseToken.address)
        setQuote.run(Number(p.priceUsd ?? 0), Number(p.priceNative ?? 0), Number(p.marketCap ?? p.fdv ?? 0), Number(p.priceChange?.h24 ?? 0), liq, Number(p.volume?.h24 ?? 0), now, addr)
      }
    }
  }

  function out(r, listed) {
    const k = listed.get(r.address.toLowerCase())
    return {
      address: r.address, symbol: r.symbol, name: r.name, decimals: r.decimals, logo: logoUrl(r.logo), description: r.description || null,
      deployer: r.deployer, pairToken: r.pair_token, pairIsWeth: r.pair_token.toLowerCase() === PONS_WETH.toLowerCase(), pool: r.pool, legacy: !!r.legacy,
      launchedAt: r.launched_at, launchTx: r.launch_tx,
      pairedEth: r.paired_principal ? Number(r.paired_principal) / 1e18 : null, thresholdEth: r.threshold ? Number(r.threshold) / 1e18 : null,
      progress: r.paired_principal && r.threshold && Number(r.threshold) > 0 ? Math.min(1, Number(r.paired_principal) / Number(r.threshold)) : null,
      graduated: !!r.graduated, graduatedAt: r.graduated_at,
      priceUsd: r.price_usd, priceEth: r.price_eth, mcapUsd: r.mcap_usd, change24h: r.change24h, liquidityUsd: r.liquidity_usd, volume24hUsd: r.volume24h_usd, quotedAt: r.quoted_at,
      kyte: k ? (k.enabled ? 'listed' : 'disabled') : 'unlisted',
      ponsUrl: `https://ponsfamily.com/launchpad/${r.address.toLowerCase()}`,
    }
  }

  /** GET /pons/tokens?status=recent|graduated|near|listed|all&hours=24&limit=N */
  async function route(u) {
    const status = u.searchParams.get('status') ?? 'graduated'
    const limit = Math.min(500, Math.max(1, Number(u.searchParams.get('limit') ?? 200) || 200))
    const listed = new Map(all('SELECT address, enabled FROM assets').map((a) => [a.address.toLowerCase(), a]))
    let rows
    // graduated: optional ?hours= window on the graduation time (24, 36, …); absent or 0 means all
    const hours = Math.min(RECENT_MAX_H, Math.max(0, Number(u.searchParams.get('hours') ?? 0) || 0))
    if (status === 'recent') rows = all('SELECT * FROM pons_tokens WHERE launched_at >= ? ORDER BY launched_at DESC LIMIT ?', Math.floor(Date.now() / 1000) - (hours || 24) * 3600, limit)
    else if (status === 'graduated') rows = hours
      ? all('SELECT * FROM pons_tokens WHERE graduated = 1 AND graduated_at >= ? ORDER BY graduated_at DESC, mcap_usd DESC LIMIT ?', Math.floor(Date.now() / 1000) - hours * 3600, limit)
      : all('SELECT * FROM pons_tokens WHERE graduated = 1 ORDER BY graduated_at DESC, mcap_usd DESC LIMIT ?', limit)
    else if (status === 'near') rows = all('SELECT * FROM pons_tokens WHERE graduated = 0 AND paired_principal IS NOT NULL AND threshold IS NOT NULL AND CAST(paired_principal AS REAL) >= 0.5 * CAST(threshold AS REAL) ORDER BY CAST(paired_principal AS REAL) / CAST(threshold AS REAL) DESC LIMIT ?', limit)
    else if (status === 'listed') rows = all('SELECT * FROM pons_tokens ORDER BY mcap_usd DESC').filter((r) => listed.has(r.address.toLowerCase())).slice(0, limit)
    else rows = all('SELECT * FROM pons_tokens ORDER BY launched_at DESC LIMIT ?', limit)
    const total = all('SELECT COUNT(*) AS n, SUM(graduated) AS g FROM pons_tokens')[0]
    return { tokens: rows.map((r) => out(r, listed)), counts: { launched: total.n, graduated: total.g ?? 0 }, ...(hours ? { hours } : {}) }
  }

  function start() {
    const launchLoop = async () => {
      try { await syncLaunches((await client.getBlock()).number) } catch (e) { log(`[pons] launches: ${e.shortMessage ?? e.message}`) }
      setTimeout(launchLoop, 30_000).unref?.()
    }
    const gradLoop = async () => {
      try { await pollGraduation() } catch (e) { log(`[pons] graduation: ${e.shortMessage ?? e.message}`) }
      setTimeout(gradLoop, GRAD_POLL_MS).unref?.()
    }
    const quoteLoop = async () => {
      try { await quote() } catch (e) { log(`[pons] quote: ${e.message}`) }
      setTimeout(quoteLoop, QUOTE_MS).unref?.()
    }
    setTimeout(launchLoop, 5_000).unref?.()
    setTimeout(gradLoop, 20_000).unref?.()
    setTimeout(quoteLoop, 40_000).unref?.()
  }

  return { route, start, syncLaunches, pollGraduation, quote, onTokens(fn) { listeners.push(fn); notify() } }
}
