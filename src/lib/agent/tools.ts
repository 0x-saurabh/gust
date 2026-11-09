// Kyte agent tools: the read and prepare functions behind the in-app agent (/api/agent) and the MCP endpoint.
//
// Ground rules, enforced here and not left to the model:
//   - Read tools only read the Kyte indexer (the same API kyte.sh uses), so the agent and the site always agree.
//   - Prepare tools never sign or send. They validate against the protocol rules and return a kyte.sh link with the
//     form pre-filled, plus a plain-language preview. The user reviews and signs in their own wallet.
//   - Everything that comes back from the chain is data. Token names and symbols are cleaned before they are shown.
//   - No private keys, seed phrases or wallet secrets anywhere in these inputs or outputs.
import { z } from 'zod'
import { RuleSchema, describeRule, ruleLink } from './autopilot.ts'
import { FEES, LIMITS, SPLIT, AUTOPILOT_ENABLED, LAUNCHPAD_ENABLED, REWARDS_ENABLED } from '../config.ts'

// ------------------------------------------------------------------ indexer access

/** Server-side indexer base URL: the private Render service, or a local indexer, never the browser's proxy path. */
export function indexerBase(): string {
  const url = process.env.INDEXER_INTERNAL_URL || process.env.AGENT_INDEXER_URL
  if (url) return url.replace(/\/$/, '')
  const hp = process.env.INDEXER_INTERNAL_HOSTPORT
  if (hp) return `http://${hp}`
  const pub = process.env.NEXT_PUBLIC_INDEXER_URL
  if (pub && /^https?:\/\//.test(pub)) return pub.replace(/\/$/, '')
  return 'http://127.0.0.1:4201'
}

const CACHE_MS = 3_000
const cache = new Map<string, { at: number; data: unknown }>()
let fetchImpl: (path: string) => Promise<unknown> = async (path) => {
  const r = await fetch(`${indexerBase()}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`indexer ${path}: ${r.status}`)
  return r.json()
}
/** Tests swap the fetcher for recorded responses. */
export function setFetcher(f: typeof fetchImpl) {
  fetchImpl = f
  cache.clear()
}
async function api<T>(path: string): Promise<T> {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as T
  const data = await fetchImpl(path)
  cache.set(path, { at: Date.now(), data })
  return data as T
}

// ------------------------------------------------------------------ shapes (as the indexer returns them)

export type Asset = { address: string; symbol: string; name: string; decimals: number; enabled: boolean; putsEnabled: boolean; cap: string; minStrike: string; source?: 'pons' | 'fobo' | null; maxDurationSec?: number; session?: Session | null }
/** Session of the stock behind a stock token, from Harmonic Agent's oracle via the indexer (docs/HARMONIC.md). */
export type Session = { state: 'open' | 'held' | 'halted' | 'paused' | 'stale' | 'unknown'; why: string | null; until: number | null; at: number; issuerUsd: number | null; weekendMarkUsd?: number; offFridayBps?: number | null }
/** One sentence an agent should pass on when the underlying is not trading; null when it is open or has no session. */
export function sessionWarning(symbol: string, s?: Session | null): string | null {
  if (!s || s.state === 'open') return null
  const sym = clean(symbol, 16)
  if (s.state === 'held') {
    const mark = s.weekendMarkUsd ? ` On chain it has traded near $${s.weekendMarkUsd.toFixed(2)} this weekend${s.offFridayBps != null ? ` (${(s.offFridayBps / 100).toFixed(2)}% from Friday)` : ''}.` : ''
    return `${sym} is in its weekend hold${s.until ? ` until ${new Date(s.until * 1000).toISOString()}` : ''}: the spot is Friday's print, not a live price.${mark}`
  }
  if (s.state === 'halted') return `Trading in ${sym} is halted: the spot is the last print before the halt and may be stale.`
  if (s.state === 'paused') return `${sym} is paused for a corporate action: the spot may not apply afterwards.`
  if (s.state === 'stale') return `The quote behind ${sym} is stale: the issuer has not printed recently.`
  return `The session behind ${sym} could not be read: treat the spot with care.`
}
export type Offer = {
  id: string; kind: 'call' | 'put'; market: string; seller: string; holder: string | null; token: string; symbol: string; decimals: number
  amount: number; strike: number; premium: number; expiry: number; offerDeadline: number
  status: 'open' | 'filled' | 'exercised' | 'expired' | 'cancelled'; fillable: boolean; createdAt: number; createdTx: string
  source?: 'pons' | 'fobo' | null; overLimit?: boolean; floorEth?: number; belowFloor?: boolean
}
export type Quote = { price: number; at: number; change1h: number; source?: string; session?: Session | null; floor?: number; floorBackingEth?: number }
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number }
export type Stake = { myActive: number; myPending: number; claimable: number; epoch: number; epochEndsAt: number; minClaim: number; totalStaked: number; lastEpochRewards: number }
export type StakerShare = { current: { epoch: number; poolUsdg: number; active: number; totalActive: number; estimatedUsdg: number; qualifies: boolean }; last: { epoch: number; amountUsdg: number; tx: string | null } | null; paidUsdg: number }
export type Stats = { volumeEth: number; feesEth: number; openInterestEth: number; burnedTokens: number; stakedTokens: number; stakers: number; activeOffers: number; totalOffers: number }
export type Proof = { splits: { epoch: number; at: number; tx: string; stakers: number; buyback: number; ops: number }[]; burns: { at: number; tx: string; wethIn: number; tokenOut: number }[]; totals: Record<string, number> }
export type Activity = { key: string; name: string; at: number; tx: string; kind: string; text: string; sub: string }

// ------------------------------------------------------------------ helpers

const SYMBOL = z.string().regex(/^[A-Za-z0-9]{1,16}$/, 'token symbol: letters and digits only')
const ADDRESS = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'an Ethereum address, 0x followed by 40 hex characters')
const OFFER_ID = z.string().regex(/^\d{1,80}$/, 'an offer id (decimal)')
const KIND = z.enum(['call', 'put'])

/** On-chain names are untrusted text: keep printable ASCII only, cap the length, so nothing can smuggle instructions. */
export function clean(s: unknown, max = 48): string {
  // Keep letters, numbers, punctuation and symbols in any script (token names like 富贵), but drop control, format and
  // bidi-override characters, which can hide or reorder text an agent reads.
  return String(s ?? '').replace(/[^\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max)
}
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const eth = (n: number, d = 6) => `${Number(n.toFixed(d))} ETH`
const hoursLeft = (ts: number, now: number) => Math.max(0, (ts - now) / 3600)
const when = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`)
export const DISCLAIMER = 'Options are risky and can expire worthless. This is information, not financial advice.'
export const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://kyte.sh'

async function assetBySymbol(symbol: string): Promise<Asset | undefined> {
  const list = await api<Asset[]>('/assets')
  return list.find((a) => a.enabled && a.symbol.toLowerCase() === symbol.toLowerCase())
}

// ------------------------------------------------------------------ read tools

export const listTokens = {
  name: 'list_tokens',
  description: 'Which tokens are listed on Kyte and can have options written on them, with whether puts are enabled, the exposure cap and the minimum strike per token. Read-only.',
  input: z.object({ query: z.string().max(32).optional().describe('Optional filter: part of a symbol or name') }),
  async run({ query }: { query?: string }) {
    const list = (await api<Asset[]>('/assets')).filter((a) => a.enabled)
    const q = query?.toLowerCase()
    const rows = list.filter((a) => !q || a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
    return {
      count: rows.length,
      tokens: rows.slice(0, 60).map((a) => ({
        symbol: clean(a.symbol, 16), name: clean(a.name), address: a.address, putsEnabled: a.putsEnabled,
        capTokens: Number(BigInt(a.cap) / 10n ** BigInt(a.decimals)), minStrikeEthPerToken: Number(a.minStrike) / 1e18,
        ...(a.source === 'pons' ? { source: 'pons', maxExpiry: '24h', note: 'Launchpad token: options on it must expire within 24 hours.' } : a.source === 'fobo' ? { source: 'fobo', maxExpiry: '24h', note: 'FOBO launchpad token: options on it must expire within 24 hours. Its floor only rises; a put struck at or below the floor can never finish in the money.' } : {}),
        ...(a.session ? { session: a.session.state, ...(sessionWarning(a.symbol, a.session) ? { warning: sessionWarning(a.symbol, a.session) } : {}) } : {}),
      })),
      truncated: rows.length > 60,
    }
  },
}

export const findOffers = {
  name: 'find_offers',
  description: 'Open option offers you can buy right now, filterable by token and kind (call or put), soonest expiry first. Each row has strike per token, premium, amount, expiry and a link. Read-only.',
  input: z.object({ token: SYMBOL.optional(), kind: KIND.optional(), limit: z.number().int().min(1).max(50).default(10) }),
  async run({ token, kind, limit = 10 }: { token?: string; kind?: 'call' | 'put'; limit?: number }) {
    const qs = new URLSearchParams({ status: 'open' })
    if (kind) qs.set('kind', kind)
    if (token) qs.set('token', token)
    const offers = (await api<Offer[]>(`/offers?${qs}`)).filter((o) => o.fillable)
    const prices = await api<Record<string, Quote>>('/prices')
    const now = Date.now() / 1000
    return {
      count: offers.length,
      offers: offers.slice(0, limit).map((o) => offerRow(o, prices[o.symbol]?.price, now, prices[o.symbol]?.session)),
      note: offers.length === 0 ? `No open ${kind ?? ''} offers${token ? ` on ${clean(token, 16)}` : ''} right now.` : undefined,
    }
  },
}

function offerRow(o: Offer, spot: number | undefined, now: number, session?: Session | null) {
  const strikePerToken = o.strike / o.amount
  const warning = sessionWarning(o.symbol, session)
  return {
    id: o.id, kind: o.kind, symbol: clean(o.symbol, 16), amount: o.amount, strikeTotalEth: o.strike, strikePerTokenEth: strikePerToken,
    premiumEth: o.premium, premiumPerTokenEth: o.premium / o.amount, premiumOverStrike: o.premium / o.strike,
    spotEthPerToken: spot ?? null, strikeVsSpot: spot ? pct(strikePerToken / spot - 1) : null,
    expiresIn: when(hoursLeft(o.expiry, now)), fillBy: when(hoursLeft(o.offerDeadline, now)), expiry: o.expiry,
    status: o.status, link: `${SITE}/market?buy=${o.id}`,
    ...(o.source ? { launchpad: o.source } : {}),
    ...(o.floorEth ? { floorEthPerToken: o.floorEth } : {}),
    ...(o.belowFloor ? { belowFloor: true, warning: `${clean(o.symbol, 16)} is a FOBO token and this put is struck at or below its floor (${o.floorEth} ETH per token). The floor buys every token above that price, so this put can never finish in the money. Do not buy it.` } : {}),
    ...(session ? { session: session.state } : {}), ...(warning ? { warning } : {}),
  }
}

export const getOffer = {
  name: 'get_offer',
  description: 'One offer or position in full by its id: kind, token, amount, strike, premium, expiry, seller, holder, status, fees and the transaction that created it. Read-only.',
  input: z.object({ id: OFFER_ID }),
  async run({ id }: { id: string }) {
    const o = await api<Offer & { premiumFee: number | null; exerciseFee: number | null }>(`/offers/${id}`)
    const prices = await api<Record<string, Quote>>('/prices')
    return { ...offerRow(o, prices[o.symbol]?.price, Date.now() / 1000, prices[o.symbol]?.session), seller: o.seller, holder: o.holder, token: o.token, createdAt: o.createdAt, createdTx: o.createdTx, premiumFee: o.premiumFee, exerciseFee: o.exerciseFee }
  },
}

export const getPositions = {
  name: 'get_positions',
  description: 'What an address holds (options it can exercise), is selling (its open and filled offers) and its recent history. Pass the connected wallet address. Read-only.',
  input: z.object({ address: ADDRESS }),
  async run({ address }: { address: string }) {
    const p = await api<{ holding: Offer[]; selling: Offer[]; history: Offer[] }>(`/positions/${address}`)
    const prices = await api<Record<string, Quote>>('/prices')
    const now = Date.now() / 1000
    const row = (o: Offer) => ({ ...offerRow(o, prices[o.symbol]?.price, now), link: `${SITE}/positions` })
    const soon = [...p.holding, ...p.selling].filter((o) => (o.status === 'open' || o.status === 'filled') && o.expiry - now < 7 * 86400)
    return { holding: p.holding.map(row), selling: p.selling.map(row), history: p.history.slice(0, 20).map(row), expiringWithin7Days: soon.map((o) => o.id) }
  },
}

export const getPrices = {
  name: 'get_prices',
  description: 'Live price in ETH per token for every listed token with a feed, the 1 hour change, the source (Uniswap v4 swaps, a DEX price or a Robinhood quote), for FOBO launchpad tokens the floor price the hook guarantees, and, for stock tokens, the session state (open, held over the weekend, halted, paused, stale) with a warning when the quote is not live. Read-only.',
  input: z.object({ tokens: z.array(SYMBOL).max(20).optional().describe('Symbols to include; all when omitted') }),
  async run({ tokens }: { tokens?: string[] }) {
    const all = await api<Record<string, Quote>>('/prices')
    const want = tokens?.map((t) => t.toLowerCase())
    const rows = Object.entries(all).filter(([s]) => !want || want.includes(s.toLowerCase()))
    return {
      prices: Object.fromEntries(rows.map(([s, q]) => [clean(s, 16), {
        ethPerToken: q.price, change1h: pct(q.change1h), at: q.at, source: q.source ?? 'uniswap-v4',
        ...(q.floor ? { floorEthPerToken: q.floor, floorVsPrice: pct(q.floor / q.price - 1), floorBackingEth: q.floorBackingEth, floorNote: 'FOBO floor: the hook buys every token at this price, so the price cannot close below it. A put struck at or below it can never finish in the money.' } : {}),
        ...(q.session ? { session: q.session.state, ...(sessionWarning(s, q.session) ? { warning: sessionWarning(s, q.session) } : {}) } : {}),
      }])),
      note: 'session: open means a live quote. held (weekend), halted, paused or stale means the price shown is the last print and not live; on-chain trading continues. Source: Harmonic Agent session oracle.',
    }
  },
}

export const getChart = {
  name: 'get_chart',
  description: 'Recent OHLC candles for a token, in ETH per token. Use for "how has X moved today". Read-only.',
  input: z.object({ token: SYMBOL, interval: z.enum(['60', '300', '900', '3600', '86400']).default('3600'), limit: z.number().int().min(2).max(200).default(24) }),
  async run({ token, interval = '3600', limit = 24 }: { token: string; interval?: string; limit?: number }) {
    const c = await api<Candle[]>(`/candles?token=${encodeURIComponent(token)}&interval=${interval}&limit=${limit}`)
    const first = c[0]?.open, last = c.at(-1)?.close
    return { token: clean(token, 16), intervalSeconds: Number(interval), candles: c, change: first && last ? pct(last / first - 1) : null }
  },
}

export const getStaking = {
  name: 'get_staking',
  description: 'Staking state: total $KYTE staked, the current epoch and when it ends, last epoch rewards, and for a given address its active and pending stake and claimable WETH. Read-only.',
  input: z.object({ address: ADDRESS.optional() }),
  async run({ address }: { address?: string }) {
    const s = await api<Stake>(`/stake/${address ?? '0x0000000000000000000000000000000000000000'}`)
    const now = Date.now() / 1000
    // The daily USDG share (docs/STAKER_USDG_SHARE.md): an estimate only; the indexer applies the per-wallet floor and cap and never returns them.
    const share = address ? await api<StakerShare>(`/staker-share/${address}`).catch(() => null) : null
    const usdgShare = share && share.current.poolUsdg > 0 ? { poolUsdgPerDay: share.current.poolUsdg, estimatedTodayUsdg: share.current.qualifies ? share.current.estimatedUsdg : 0, qualifiesToday: share.current.qualifies, lastPaidUsdg: share.last?.amountUsdg ?? null, lastPaidTx: share.last?.tx ?? null, receivedUsdg: share.paidUsdg, how: 'Paid daily in USDG straight to the staking wallet from Kyte’s Pons creator rewards; nothing to claim. Only stake active for the whole day counts.' } : undefined
    return { ...s, ...(usdgShare ? { usdgShare } : {}), epochEndsIn: when(hoursLeft(s.epochEndsAt, now)), rules: `New stake is pending until the epoch ends, then active and locked for one epoch. Pending stake can be unstaked any time. Stakers receive ${SPLIT.stakersBps / 100}% of all fees in WETH${usdgShare ? ', plus a daily USDG share of Kyte’s Pons creator rewards, paid straight to the wallet' : ''}.`, link: `${SITE}/stake` }
  },
}

export const getProtocolStats = {
  name: 'get_protocol_stats',
  description: 'Protocol totals: volume, fees, open interest, $KYTE burned, $KYTE staked, number of stakers, active and total offers. Read-only.',
  input: z.object({}),
  async run() {
    const s = await api<Stats>('/stats')
    return { ...s, feeSplit: { stakersPct: SPLIT.stakersBps / 100, buybackPct: SPLIT.buybackBps / 100, opsPct: SPLIT.opsBps / 100 } }
  },
}

export const getProof = {
  name: 'get_proof',
  description: 'Every fee split (per epoch, with the WETH to stakers, buyback and operations) and every $KYTE buyback burn, each with its transaction hash. Read-only.',
  input: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
  async run({ limit = 20 }: { limit?: number }) {
    const p = await api<Proof>('/proof')
    return { splits: p.splits.slice(0, limit), burns: p.burns.slice(0, limit), totals: p.totals, link: `${SITE}/proof` }
  },
}

export const getActivity = {
  name: 'get_activity',
  description: 'Recent protocol events: listings, fills, exercises, expiries, cancellations, fee splits, burns and staking, newest first, each with a transaction hash. Read-only.',
  input: z.object({ token: SYMBOL.optional(), limit: z.number().int().min(1).max(50).default(20) }),
  async run({ token, limit = 20 }: { token?: string; limit?: number }) {
    const qs = new URLSearchParams({ limit: String(limit) })
    if (token) qs.set('token', token)
    const rows = await api<Activity[]>(`/activity?${qs}`)
    return { events: rows.map((e) => ({ name: e.name, at: e.at, text: clean(e.text, 120), detail: clean(e.sub, 120), tx: e.tx })) }
  },
}

export const explainOffer = {
  name: 'explain_offer',
  description: 'Plain-language economics of one offer for both sides: what the buyer pays and gets, breakeven per token, max loss and max payoff, what the seller receives after fees, exercise fee, time left. Computed from get_offer and get_prices. Read-only.',
  input: z.object({ id: OFFER_ID }),
  async run({ id }: { id: string }) {
    const o = await getOffer.run({ id })
    const premiumFee = o.premiumEth * (FEES.premiumBps / 10_000)
    const exerciseFee = o.strikeTotalEth * (FEES.exerciseBps / 10_000)
    const per = o.amount
    const call = o.kind === 'call'
    const breakevenPerToken = call ? (o.strikeTotalEth + o.premiumEth) / per : (o.strikeTotalEth - o.premiumEth) / per
    return {
      offer: o,
      buyer: {
        pays: eth(o.premiumEth) + ' premium now',
        right: call ? `pay ${eth(o.strikeTotalEth)} (${eth(o.strikePerTokenEth, 8)} per token) before expiry and receive ${o.amount} ${o.symbol}` : `deliver ${o.amount} ${o.symbol} before expiry and receive ${eth(o.strikeTotalEth)}`,
        breakevenEthPerToken: breakevenPerToken,
        breakevenVsSpot: o.spotEthPerToken ? pct(breakevenPerToken / o.spotEthPerToken - 1) : null,
        maxLoss: eth(o.premiumEth) + ' (the premium, if never exercised)',
        maxPayoff: call ? 'unlimited above breakeven' : `${eth(o.strikeTotalEth - o.premiumEth)} if the token went to zero`,
        exerciseFee: eth(exerciseFee) + ` (${FEES.exerciseBps / 100}% of the strike, paid on exercise)`,
      },
      seller: {
        locked: call ? `${o.amount} ${o.symbol}` : eth(o.strikeTotalEth) + ' as WETH',
        receivesNow: eth(o.premiumEth - premiumFee) + ` (premium minus the ${FEES.premiumBps / 100}% fee of ${eth(premiumFee)})`,
        ifExercised: call ? `receives ${eth(o.strikeTotalEth - exerciseFee)} and gives up the tokens` : `receives ${o.amount} ${o.symbol} and gives up the locked ETH`,
        ifExpired: 'collateral returns, keeps the premium',
      },
      timing: { expiresIn: o.expiresIn, fillBy: o.fillBy, note: 'Exercise needs a confirmed transaction before the expiry timestamp. Leave a margin.' },
      disclaimer: DISCLAIMER,
    }
  },
}

export const compareOffers = {
  name: 'compare_offers',
  description: 'Rank the open offers on one token: premium per token, premium as a share of strike, strike versus spot, time to expiry. Returns a sorted table with a short reason per row. Information only. Read-only.',
  input: z.object({ token: SYMBOL, kind: KIND.optional(), sortBy: z.enum(['premiumOverStrike', 'premiumPerToken', 'expiry', 'strikeVsSpot']).default('premiumOverStrike') }),
  async run({ token, kind, sortBy = 'premiumOverStrike' }: { token: string; kind?: 'call' | 'put'; sortBy?: string }) {
    const { offers } = await findOffers.run({ token, kind, limit: 50 })
    const sorted = [...offers].sort((a, b) => {
      if (sortBy === 'expiry') return a.expiry - b.expiry
      if (sortBy === 'premiumPerToken') return b.premiumPerTokenEth - a.premiumPerTokenEth
      if (sortBy === 'strikeVsSpot') return (a.spotEthPerToken ? a.strikePerTokenEth / a.spotEthPerToken : 0) - (b.spotEthPerToken ? b.strikePerTokenEth / b.spotEthPerToken : 0)
      return b.premiumOverStrike - a.premiumOverStrike
    })
    return {
      token: clean(token, 16), count: sorted.length, sortBy,
      rows: sorted.map((o, i) => ({ rank: i + 1, ...o, why: `${pct(o.premiumOverStrike)} of strike as premium, strike ${o.strikeVsSpot ?? 'n/a'} vs spot, expires in ${o.expiresIn}` })),
      disclaimer: DISCLAIMER,
    }
  },
}

// ------------------------------------------------------------------ prepare tools (never sign, never send)

async function sessionWarningFor(symbol: string): Promise<string | null> {
  try { const prices = await api<Record<string, Quote>>('/prices'); return sessionWarning(symbol, prices[symbol]?.session) } catch { return null }
}

const EXPIRY_CHOICES = { '1h': 3600, '1d': 86400, '3d': 3 * 86400, '1w': 7 * 86400, '2w': 14 * 86400, '1m': 30 * 86400, '3m': 90 * 86400 } as const
type ExpiryKey = keyof typeof EXPIRY_CHOICES

export const prepareBuy = {
  name: 'prepare_buy',
  description: 'Prepare buying an open offer: returns a preview of what the buyer pays and gets and a kyte.sh link that opens the buy dialog for that offer. Does not send anything; the user signs in their wallet.',
  input: z.object({ id: OFFER_ID }),
  async run({ id }: { id: string }) {
    const o = await getOffer.run({ id })
    if (o.status !== 'open') return { error: `Offer ${id} is ${o.status}, it cannot be bought.` }
    const warning = await sessionWarningFor(o.symbol)
    return { ...(warning ? { warning } : {}), preview: `Pay ${eth(o.premiumEth)} premium for the right to ${o.kind === 'call' ? 'buy' : 'sell'} ${o.amount} ${o.symbol} at ${eth(o.strikePerTokenEth, 8)} per token until expiry (${o.expiresIn}).`, link: `${SITE}/market?buy=${id}`, signs: 'You review and sign in your wallet. Kyte never holds your keys.', disclaimer: DISCLAIMER }
  },
}

async function validateOffer(input: { kind: 'call' | 'put'; token: string; amount: number; strikePerToken: number; premium: number; expiry: ExpiryKey; fillWindow?: ExpiryKey }) {
  const a = await assetBySymbol(input.token)
  if (!a) return { error: `${clean(input.token, 16)} is not listed on Kyte. Use list_tokens to see what is.` }
  if (input.kind === 'put' && !a.putsEnabled) return { error: `Cash-secured puts are not open on ${a.symbol}; covered calls are.` }
  if (input.amount <= 0) return { error: 'Amount must be positive.' }
  const minStrike = Number(a.minStrike) / 1e18
  if (input.strikePerToken < minStrike) return { error: `Strike per token must be at least ${minStrike} ETH on ${a.symbol}.` }
  if (input.premium < LIMITS.minPremiumEth) return { error: `Premium must be at least ${LIMITS.minPremiumEth} ETH.` }
  const exp = EXPIRY_CHOICES[input.expiry]
  if (exp < LIMITS.minDurationSec || exp > LIMITS.maxDurationSec) return { error: 'Expiry must be between 1 hour and 90 days.' }
  const maxDur = Math.min(LIMITS.maxDurationSec, a.maxDurationSec ?? LIMITS.maxDurationSec)
  if (exp > maxDur) return { error: `${a.symbol} is a Pons launchpad token: options on it must expire within 24 hours. Use expiry '1h' or '1d'.` }
  const fill = input.fillWindow ? EXPIRY_CHOICES[input.fillWindow] : exp
  if (fill > exp) return { error: 'The fill window cannot be later than expiry.' }
  const cap = Number(BigInt(a.cap) / 10n ** BigInt(a.decimals))
  if (input.amount > cap) return { error: `Amount exceeds the ${a.symbol} exposure cap of ${cap} tokens.` }
  return { asset: a, expirySec: exp, fillSec: fill }
}

function sellLink(kind: 'call' | 'put', token: string, amount: number, strikePerToken: number, premium: number, expirySec: number, fillSec: number) {
  const qs = new URLSearchParams({ kind, token, amount: String(amount), strike: String(strikePerToken), premium: String(premium), expiry: String(expirySec), deadline: String(fillSec) })
  return `${SITE}/sell?${qs}`
}

export const prepareCoveredCall = {
  name: 'prepare_covered_call',
  description: 'Prepare a covered call: validates token, amount, strike per token (ETH), premium (ETH) and expiry against the protocol rules, then returns a preview and a kyte.sh Sell link with the form pre-filled. The seller must hold the tokens. Does not send anything.',
  input: z.object({ token: SYMBOL, amount: z.number().positive(), strikePerToken: z.number().positive(), premium: z.number().positive(), expiry: z.enum(['1h', '1d', '3d', '1w', '2w', '1m', '3m']).default('1w'), fillWindow: z.enum(['1h', '1d', '3d', '1w', '2w', '1m', '3m']).optional() }),
  async run(i: { token: string; amount: number; strikePerToken: number; premium: number; expiry?: ExpiryKey; fillWindow?: ExpiryKey }) {
    const v = await validateOffer({ ...i, kind: 'call', expiry: i.expiry ?? '1w' })
    if ('error' in v) return v
    const fee = i.premium * (FEES.premiumBps / 10_000)
    const warning = sessionWarning(v.asset.symbol, v.asset.session)
    return { ...(warning ? { warning } : {}), preview: `Lock ${i.amount} ${v.asset.symbol}. Strike ${i.strikePerToken} ETH per token (${eth(i.strikePerToken * i.amount)} total), premium ${eth(i.premium)}, expires in ${i.expiry ?? '1w'}. If filled you receive ${eth(i.premium - fee)} after the ${FEES.premiumBps / 100}% fee.`, link: sellLink('call', v.asset.symbol, i.amount, i.strikePerToken, i.premium, v.expirySec, v.fillSec), signs: 'One approval for the token, then createOffer, both signed in your wallet.', disclaimer: DISCLAIMER }
  },
}

export const prepareCashSecuredPut = {
  name: 'prepare_cash_secured_put',
  description: 'Prepare a cash-secured put (only on tokens with puts enabled): validates the inputs and returns a preview and a pre-filled kyte.sh Sell link. The seller locks the strike in WETH. Does not send anything.',
  input: prepareCoveredCall.input,
  async run(i: { token: string; amount: number; strikePerToken: number; premium: number; expiry?: ExpiryKey; fillWindow?: ExpiryKey }) {
    const v = await validateOffer({ ...i, kind: 'put', expiry: i.expiry ?? '1w' })
    if ('error' in v) return v
    if (v.asset.source === 'fobo') {
      // FOBO: the floor buys every token at or above its price, so a put struck there can never be exercised. Nobody should pay for one.
      const floor = (await api<Record<string, Quote>>('/prices').catch(() => ({} as Record<string, Quote>)))[v.asset.symbol]?.floor
      if (floor && i.strikePerToken <= floor) return { error: `${v.asset.symbol} is a FOBO token and ${i.strikePerToken} ETH is at or below its floor (${floor} ETH per token): a put there can never finish in the money, so Kyte does not list it. Choose a strike above the floor.` }
    }
    const fee = i.premium * (FEES.premiumBps / 10_000)
    const warning = sessionWarning(v.asset.symbol, v.asset.session)
    return { ...(warning ? { warning } : {}), preview: `Lock ${eth(i.strikePerToken * i.amount)} as WETH. You promise to buy ${i.amount} ${v.asset.symbol} at ${i.strikePerToken} ETH per token until expiry (${i.expiry ?? '1w'}), premium ${eth(i.premium)}. If filled you receive ${eth(i.premium - fee)} after fees.`, link: sellLink('put', v.asset.symbol, i.amount, i.strikePerToken, i.premium, v.expirySec, v.fillSec), signs: 'One WETH approval, then createOffer, both signed in your wallet.', disclaimer: DISCLAIMER }
  },
}

export const prepareExercise = {
  name: 'prepare_exercise',
  description: 'Prepare exercising a held option: checks it is filled and not expired, previews what the holder pays and receives including the exercise fee, and returns the kyte.sh Positions link. Does not send anything.',
  input: z.object({ id: OFFER_ID }),
  async run({ id }: { id: string }) {
    const o = await getOffer.run({ id })
    if (o.status !== 'filled') return { error: `Position ${id} is ${o.status}; only a filled option can be exercised.` }
    if (o.expiry <= Date.now() / 1000) return { error: `Position ${id} has expired; it can no longer be exercised.` }
    const fee = o.strikeTotalEth * (FEES.exerciseBps / 10_000)
    const warning = await sessionWarningFor(o.symbol)
    return { ...(warning ? { warning } : {}), preview: o.kind === 'call' ? `Pay ${eth(o.strikeTotalEth)} plus ${eth(fee)} fee, receive ${o.amount} ${o.symbol}.` : `Deliver ${o.amount} ${o.symbol}, receive ${eth(o.strikeTotalEth - fee)} after the ${FEES.exerciseBps / 100}% fee.`, expiresIn: o.expiresIn, link: `${SITE}/positions?exercise=${id}`, signs: 'Signed in your wallet from the Positions page.', disclaimer: DISCLAIMER }
  },
}

export const prepareStake = {
  name: 'prepare_stake',
  description: 'Prepare staking or unstaking $KYTE, or claiming WETH rewards: returns a preview and a pre-filled kyte.sh Stake link. Does not send anything.',
  input: z.object({ action: z.enum(['stake', 'unstake', 'claim']), amount: z.number().positive().optional().describe('$KYTE amount for stake or unstake') }),
  async run({ action, amount }: { action: 'stake' | 'unstake' | 'claim'; amount?: number }) {
    if (action !== 'claim' && !amount) return { error: `Give the $KYTE amount to ${action}.` }
    const qs = new URLSearchParams({ action }); if (amount) qs.set('amount', String(amount))
    const preview = action === 'claim' ? 'Claim your accrued WETH rewards.' : action === 'stake' ? `Stake ${amount} $KYTE. It is pending until the epoch ends, then active and locked for one epoch.` : `Unstake ${amount} $KYTE. Pending stake leaves immediately; active stake must be past its lock epoch.`
    return { preview, link: `${SITE}/stake?${qs}`, signs: 'Signed in your wallet from the Stake page.', disclaimer: DISCLAIMER }
  },
}

// ---- Autopilot (watch and prepare). The agent designs rules; the user signs them on the Autopilot page.
export const designStrategy = {
  name: 'design_strategy',
  description: 'Turn a plain-language strategy into an Autopilot rule (sell covered calls or puts on a schedule, flag cheap calls or puts to buy, exercise in-the-money options, cancel stale offers). Validates the rule, explains it, and shows what it would have triggered over the last 30 days of prices. Returns a link to the Autopilot page where the user signs it. Nothing runs until the user signs. Ask for any number the user has not given rather than inventing it.',
  input: z.object({ rule: RuleSchema }),
  async run({ rule }: { rule: z.infer<typeof RuleSchema> }) {
    const needsToken = rule.type !== 'exercise' && rule.type !== 'cancel_unfilled'
    if (needsToken && !rule.token) return { error: 'Which token?' }
    let backtest: Record<string, unknown> | undefined
    if (needsToken && rule.token) {
      const a = await assetBySymbol(rule.token)
      if (!a) { const list = await api<Asset[]>('/assets'); return { error: `${rule.token} is not an enabled market. Markets: ${list.filter((x) => x.enabled).map((x) => x.symbol).join(', ')}.` } }
      if (rule.type === 'list_put' && (a as { putsEnabled?: boolean }).putsEnabled === false) return { error: `Puts are not enabled on ${a.symbol}.` }
      const candles = await api<Array<{ time: number; open: number; high: number; low: number; close: number }>>(`/candles?symbol=${encodeURIComponent(a.symbol)}&interval=86400&limit=30`).catch(() => [])
      if (candles.length > 2) {
        const closes = candles.map((c) => c.close)
        const first = closes[0], last = closes[closes.length - 1]
        const maxUp = Math.max(...candles.map((c) => c.high)) / first - 1
        const maxDown = 1 - Math.min(...candles.map((c) => c.low)) / first
        const p = rule.params
        const line = rule.type === 'list_call' ? `A call ${p.pct}% above spot sold on day 1 would ${maxUp * 100 >= (p.pct ?? 0) ? 'have gone in the money (high was ' + (maxUp * 100).toFixed(1) + '% above)' : 'have expired unexercised (high was only ' + (maxUp * 100).toFixed(1) + '% above)'}.`
          : rule.type === 'list_put' ? `A put ${p.pct}% below spot sold on day 1 would ${maxDown * 100 >= (p.pct ?? 0) ? 'have gone in the money (low was ' + (maxDown * 100).toFixed(1) + '% below)' : 'have expired unexercised (low was only ' + (maxDown * 100).toFixed(1) + '% below)'}.`
          : `Spot moved ${((last / first - 1) * 100).toFixed(1)}% over the period; high ${(maxUp * 100).toFixed(1)}% above and low ${(maxDown * 100).toFixed(1)}% below the start.`
        backtest = { days: candles.length, start: first, end: last, changePct: Number(((last / first - 1) * 100).toFixed(2)), summary: line, caveat: 'History, not a forecast. One sample path.' }
      }
    }
    return { rule, description: describeRule(rule), backtest, link: ruleLink(SITE, rule), signs: 'On the Autopilot page the user reviews the rule and signs a message (free). From then on Kyte watches and prepares each action for them to sign.', disclaimer: DISCLAIMER }
  },
}
export const listStrategies = {
  name: 'list_strategies',
  description: 'The user\'s Autopilot rules and the triggers waiting for them (prepared actions to review and sign). Needs the wallet address.',
  input: z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }),
  async run({ address }: { address: string }) {
    const [rules, triggers] = await Promise.all([fetchImpl(`/autopilot/rules/${address}`), fetchImpl(`/autopilot/triggers/${address}?limit=20`)])
    const rs = (rules as Array<Record<string, unknown>>).map((r) => ({ id: r.id, status: r.status, runs: r.runs, description: describeRule(r as never), note: r.note }))
    const ts = (triggers as Array<Record<string, unknown>>).map((t) => ({ id: t.id, ruleId: t.ruleId, at: t.at, label: t.label, preview: t.preview, link: t.link, seen: t.seen }))
    return { rules: rs, waiting: ts.filter((t) => !t.seen), recent: ts.filter((t) => t.seen).slice(0, 5), manage: `${SITE}/autopilot` }
  },
}

export type PonsToken = { address: string; symbol: string; name: string; pairIsWeth: boolean; launchedAt: number; pairedEth: number | null; thresholdEth: number | null; progress: number | null; graduated: boolean; graduatedAt: number | null; priceUsd: number | null; priceEth: number | null; mcapUsd: number | null; change24h: number | null; liquidityUsd: number | null; volume24hUsd: number | null; kyte: 'listed' | 'disabled' | 'scheduled' | 'unlisted'; ponsUrl: string }
export type FoboToken = { address: string; symbol: string; name: string; logo?: string | null; socials?: Array<{ type: string; url: string }>; quoteIsEth: boolean; launchedAt: number; ageSec: number; floorEth: number | null; floorBackingEth: number | null; floorVsPrice: number | null; progress: number | null; barEth: number; eligible: boolean; eligibleAt: number | null; priceUsd: number | null; priceEth: number | null; mcapUsd: number | null; change24h: number | null; liquidityUsd: number | null; kyte: 'listed' | 'disabled' | 'scheduled' | 'unlisted'; foboUrl: string }
export const listGraduated = {
  name: 'list_graduated',
  description: 'Launchpad tokens on Robinhood Chain. launchpad=pons (default): graduated (locked liquidity crossed 4.2 ETH), near graduation, recent, or the ones listed on Kyte. launchpad=fobo: tokens from fobo.fun, whose floor only rises; status eligible = the floor backs 4.2 ETH after 24 h (Kyte lists these), near = getting close, recent = new launches, listed = on Kyte. Each has price, market cap, 24h change, liquidity (FOBO: the floor price and what it backs) and whether Kyte lists it. Options on launchpad tokens expire within 24 hours. Read-only.',
  input: z.object({
    launchpad: z.enum(['pons', 'fobo']).default('pons'),
    status: z.enum(['recent', 'graduated', 'near', 'listed', 'eligible']).optional().describe('pons: graduated (default) | near | recent | listed. fobo: eligible (default) | near | recent | listed'),
    hours: z.number().int().min(1).max(72).default(36).describe('window in hours for graduated and recent (pons: 36 at most, fobo: 72)'),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async run({ launchpad, status, hours, limit }: { launchpad?: 'pons' | 'fobo'; status?: 'recent' | 'graduated' | 'near' | 'listed' | 'eligible'; hours?: number; limit?: number }) {
    if (launchpad === 'fobo') {
      const st = status === 'graduated' || !status ? 'eligible' : status
      const r = await api<{ tokens: FoboToken[]; counts: { launched: number; ethQuoted: number; eligible: number }; rule: { minAgeSec: number; minFloorEth: number } }>(`/fobo/tokens?status=${st}&hours=${Math.min(72, hours ?? 72)}&limit=${limit ?? 20}`)
      return {
        launchpad: 'fobo', counts: r.counts, rule: `Kyte lists an ETH-quoted FOBO token once it is ${Math.round((r.rule?.minAgeSec ?? 86400) / 3600)} h old and its floor backs ${r.rule?.minFloorEth ?? 4.2} ETH for the circulating tokens; options on it must expire within 24 hours. The floor only rises: a put struck at or below it can never finish in the money.`,
        tokens: r.tokens.map((t) => ({ symbol: clean(t.symbol, 16), name: clean(t.name), address: t.address, logo: t.logo ?? undefined, links: t.socials?.length ? t.socials : undefined, eligible: t.eligible, eligibleAt: t.eligibleAt, ageHours: Math.round(t.ageSec / 3600), floorEthPerToken: t.floorEth, floorBackingEth: t.floorBackingEth, floorVsPrice: t.floorVsPrice == null ? null : pct(t.floorVsPrice), progress: t.progress, priceEth: t.priceEth, priceUsd: t.priceUsd, mcapUsd: t.mcapUsd, change24h: t.change24h, liquidityUsd: t.liquidityUsd, onKyte: t.kyte, fobo: t.foboUrl, kyteMarket: t.kyte === 'listed' ? `${SITE}/market?token=${encodeURIComponent(t.symbol)}` : undefined })),
        launchpadPage: `${SITE}/launchpad`,
      }
    }
    const st = status === 'eligible' || !status ? 'graduated' : status
    const r = (await api<{ tokens: PonsToken[]; counts: { launched: number; graduated: number } }>(`/pons/tokens?status=${st}&hours=${Math.min(36, hours ?? 36)}&limit=${limit ?? 20}`))
    return {
      launchpad: 'pons', counts: r.counts, ...(st === 'recent' ? { windowHours: Math.min(36, hours ?? 24) } : {}), rule: 'Kyte lists graduated, ETH-paired Pons tokens after review; options on them must expire within 24 hours.',
      tokens: r.tokens.map((t) => ({ symbol: clean(t.symbol, 16), name: clean(t.name), address: t.address, graduated: t.graduated, graduatedAt: t.graduatedAt, progress: t.progress, pairedEth: t.pairedEth, priceEth: t.priceEth, priceUsd: t.priceUsd, mcapUsd: t.mcapUsd, change24h: t.change24h, liquidityUsd: t.liquidityUsd, onKyte: t.kyte, pons: t.ponsUrl, kyteMarket: t.kyte === 'listed' ? `${SITE}/market?token=${encodeURIComponent(t.symbol)}` : undefined })),
      launchpad_page: `${SITE}/launchpad`,
    }
  },
}

export type RewardsAccount = { account: string; contract: string | null; current: { epoch: number; endsAt: number; points: number; share: number; estimatedUsdg: number; feeEth: number; detail: Record<string, number>; poolUsdg: number }; claimable: Array<{ epoch: number; amountUsdg: number; expiresAt: number | null }>; claimableUsdg: number; claimedUsdg: number; epochs: Array<{ epoch: number; endsAt: number; points: number; share: number; amountUsdg: number; status: string }> }
export type RewardsProgram = { contract: string | null; poolUsdg: number; availableUsdg: number | null; rules: { pointPerEthFee: number; openInterestWeight: number; stockPutMultiplier: number; minClaimUsdg: number }; current: { epoch: number; endsAt: number; poolUsdg: number; totalPoints: number; participants: number }; epochs: Array<{ epoch: number; endsAt: number; poolUsdg: number; participants: number; totalUsdg: number; status: string }> }
export const getRewards = {
  name: 'get_rewards',
  description: 'USDG trading rewards: the pool this 24 h epoch, the scoring rules (points per ETH of fee paid, 1.5x for cash-secured puts on stock tokens, 0.2x for open interest carried through an epoch end), and for a given address its points and estimated USDG this epoch, the epochs it can claim now and what it has claimed. Claims are signed on the kyte.sh Rewards page. Read-only.',
  input: z.object({ address: ADDRESS.optional().describe('Wallet to look up; omit for the program only') }),
  async run({ address }: { address?: string }) {
    const program = await api<RewardsProgram>('/rewards')
    const rules = `1 point per ${1 / program.rules.pointPerEthFee} ETH of fee paid on a premium (buyer and seller each); the writer of a cash-secured put on a stock token gets ${program.rules.stockPutMultiplier}x; a position held through an epoch end earns ${program.rules.openInterestWeight}x its fee to both sides every epoch. The epoch's pool splits pro rata; shares below ${program.rules.minClaimUsdg} USDG are not paid. Fees are real cost, so nothing is free to farm.`
    const base = { token: 'USDG', contract: program.contract, poolUsdgThisEpoch: program.current.poolUsdg, epoch: program.current.epoch, epochEndsIn: when(hoursLeft(program.current.endsAt, Date.now() / 1000)), participantsThisEpoch: program.current.participants, totalPointsThisEpoch: program.current.totalPoints, fundedUnowedUsdg: program.availableUsdg, rules, recentEpochs: program.epochs.slice(0, 7).map((e) => ({ epoch: e.epoch, endsAt: e.endsAt, poolUsdg: e.poolUsdg, participants: e.participants, paidUsdg: e.totalUsdg, status: e.status })), link: `${SITE}/rewards`, ...(program.contract ? {} : { note: 'Points are scored already; payouts start when the rewards contract is deployed and funded.' }) }
    if (!address) return base
    const a = await api<RewardsAccount>(`/rewards/${address}`)
    return {
      ...base,
      account: a.account,
      thisEpoch: { points: a.current.points, share: pct(a.current.share), estimatedUsdg: a.current.estimatedUsdg, feePaidEth: a.current.feeEth, from: a.current.detail },
      claimableUsdg: a.claimableUsdg, claimable: a.claimable.map((e) => ({ epoch: e.epoch, usdg: e.amountUsdg, claimUntil: e.expiresAt })), claimedUsdg: a.claimedUsdg,
      history: a.epochs.slice(0, 14).map((e) => ({ epoch: e.epoch, endsAt: e.endsAt, points: e.points, share: pct(e.share), usdg: e.amountUsdg, status: e.status })),
      claim: a.claimableUsdg > 0 ? `Open ${SITE}/rewards and press Claim; the USDG goes to ${a.account} and the claim is signed in the wallet.` : undefined,
    }
  },
}

export const READ_TOOLS = [listTokens, findOffers, getOffer, getPositions, getPrices, getChart, getStaking, getProtocolStats, getProof, getActivity, explainOffer, compareOffers, ...(LAUNCHPAD_ENABLED ? [listGraduated] : []), ...(AUTOPILOT_ENABLED ? [listStrategies] : []), ...(REWARDS_ENABLED ? [getRewards] : [])] as const
export const PREPARE_TOOLS = [prepareBuy, prepareCoveredCall, prepareCashSecuredPut, prepareExercise, prepareStake, ...(AUTOPILOT_ENABLED ? [designStrategy] : [])] as const
export const ALL_TOOLS = [...READ_TOOLS, ...PREPARE_TOOLS] as const
