// Kyte agent tools: the read and prepare functions behind the in-app agent (/api/agent) and the MCP endpoint.
//
// Ground rules, enforced here and not left to the model:
//   - Read tools only read the Kyte indexer (the same API kyte.sh uses), so the agent and the site always agree.
//   - Prepare tools never sign or send. They validate against the protocol rules and return a kyte.sh link with the
//     form pre-filled, plus a plain-language preview. The user reviews and signs in their own wallet.
//   - Everything that comes back from the chain is data. Token names and symbols are cleaned before they are shown.
//   - No private keys, seed phrases or wallet secrets anywhere in these inputs or outputs.
import { z } from 'zod'
import { FEES, LIMITS, SPLIT } from '../config.ts'

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

export type Asset = { address: string; symbol: string; name: string; decimals: number; enabled: boolean; putsEnabled: boolean; cap: string; minStrike: string }
export type Offer = {
  id: string; kind: 'call' | 'put'; market: string; seller: string; holder: string | null; token: string; symbol: string; decimals: number
  amount: number; strike: number; premium: number; expiry: number; offerDeadline: number
  status: 'open' | 'filled' | 'exercised' | 'expired' | 'cancelled'; fillable: boolean; createdAt: number; createdTx: string
}
export type Quote = { price: number; at: number; change1h: number; source?: string }
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number }
export type Stake = { myActive: number; myPending: number; claimable: number; epoch: number; epochEndsAt: number; minClaim: number; totalStaked: number; lastEpochRewards: number }
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
  return String(s ?? '').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
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
      offers: offers.slice(0, limit).map((o) => offerRow(o, prices[o.symbol]?.price, now)),
      note: offers.length === 0 ? `No open ${kind ?? ''} offers${token ? ` on ${clean(token, 16)}` : ''} right now.` : undefined,
    }
  },
}

function offerRow(o: Offer, spot: number | undefined, now: number) {
  const strikePerToken = o.strike / o.amount
  return {
    id: o.id, kind: o.kind, symbol: clean(o.symbol, 16), amount: o.amount, strikeTotalEth: o.strike, strikePerTokenEth: strikePerToken,
    premiumEth: o.premium, premiumPerTokenEth: o.premium / o.amount, premiumOverStrike: o.premium / o.strike,
    spotEthPerToken: spot ?? null, strikeVsSpot: spot ? pct(strikePerToken / spot - 1) : null,
    expiresIn: when(hoursLeft(o.expiry, now)), fillBy: when(hoursLeft(o.offerDeadline, now)), expiry: o.expiry,
    status: o.status, link: `${SITE}/market?buy=${o.id}`,
  }
}

export const getOffer = {
  name: 'get_offer',
  description: 'One offer or position in full by its id: kind, token, amount, strike, premium, expiry, seller, holder, status, fees and the transaction that created it. Read-only.',
  input: z.object({ id: OFFER_ID }),
  async run({ id }: { id: string }) {
    const o = await api<Offer & { premiumFee: number | null; exerciseFee: number | null }>(`/offers/${id}`)
    const prices = await api<Record<string, Quote>>('/prices')
    return { ...offerRow(o, prices[o.symbol]?.price, Date.now() / 1000), seller: o.seller, holder: o.holder, token: o.token, createdAt: o.createdAt, createdTx: o.createdTx, premiumFee: o.premiumFee, exerciseFee: o.exerciseFee }
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
  description: 'Live price in ETH per token for every listed token with a feed, the 1 hour change and the source (Uniswap v4 swaps or a Robinhood quote). Read-only.',
  input: z.object({ tokens: z.array(SYMBOL).max(20).optional().describe('Symbols to include; all when omitted') }),
  async run({ tokens }: { tokens?: string[] }) {
    const all = await api<Record<string, Quote>>('/prices')
    const want = tokens?.map((t) => t.toLowerCase())
    const rows = Object.entries(all).filter(([s]) => !want || want.includes(s.toLowerCase()))
    return { prices: Object.fromEntries(rows.map(([s, q]) => [clean(s, 16), { ethPerToken: q.price, change1h: pct(q.change1h), at: q.at, source: q.source ?? 'uniswap-v4' }])) }
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
    return { ...s, epochEndsIn: when(hoursLeft(s.epochEndsAt, now)), rules: `New stake is pending until the epoch ends, then active and locked for one epoch. Pending stake can be unstaked any time. Stakers receive ${SPLIT.stakersBps / 100}% of all fees in WETH.`, link: `${SITE}/stake` }
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

const EXPIRY_CHOICES = { '1h': 3600, '1d': 86400, '3d': 3 * 86400, '1w': 7 * 86400, '2w': 14 * 86400, '1m': 30 * 86400, '3m': 90 * 86400 } as const
type ExpiryKey = keyof typeof EXPIRY_CHOICES

export const prepareBuy = {
  name: 'prepare_buy',
  description: 'Prepare buying an open offer: returns a preview of what the buyer pays and gets and a kyte.sh link that opens the buy dialog for that offer. Does not send anything; the user signs in their wallet.',
  input: z.object({ id: OFFER_ID }),
  async run({ id }: { id: string }) {
    const o = await getOffer.run({ id })
    if (o.status !== 'open') return { error: `Offer ${id} is ${o.status}, it cannot be bought.` }
    return { preview: `Pay ${eth(o.premiumEth)} premium for the right to ${o.kind === 'call' ? 'buy' : 'sell'} ${o.amount} ${o.symbol} at ${eth(o.strikePerTokenEth, 8)} per token until expiry (${o.expiresIn}).`, link: `${SITE}/market?buy=${id}`, signs: 'You review and sign in your wallet. Kyte never holds your keys.', disclaimer: DISCLAIMER }
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
    return { preview: `Lock ${i.amount} ${v.asset.symbol}. Strike ${i.strikePerToken} ETH per token (${eth(i.strikePerToken * i.amount)} total), premium ${eth(i.premium)}, expires in ${i.expiry ?? '1w'}. If filled you receive ${eth(i.premium - fee)} after the ${FEES.premiumBps / 100}% fee.`, link: sellLink('call', v.asset.symbol, i.amount, i.strikePerToken, i.premium, v.expirySec, v.fillSec), signs: 'One approval for the token, then createOffer, both signed in your wallet.', disclaimer: DISCLAIMER }
  },
}

export const prepareCashSecuredPut = {
  name: 'prepare_cash_secured_put',
  description: 'Prepare a cash-secured put (only on tokens with puts enabled): validates the inputs and returns a preview and a pre-filled kyte.sh Sell link. The seller locks the strike in WETH. Does not send anything.',
  input: prepareCoveredCall.input,
  async run(i: { token: string; amount: number; strikePerToken: number; premium: number; expiry?: ExpiryKey; fillWindow?: ExpiryKey }) {
    const v = await validateOffer({ ...i, kind: 'put', expiry: i.expiry ?? '1w' })
    if ('error' in v) return v
    const fee = i.premium * (FEES.premiumBps / 10_000)
    return { preview: `Lock ${eth(i.strikePerToken * i.amount)} as WETH. You promise to buy ${i.amount} ${v.asset.symbol} at ${i.strikePerToken} ETH per token until expiry (${i.expiry ?? '1w'}), premium ${eth(i.premium)}. If filled you receive ${eth(i.premium - fee)} after fees.`, link: sellLink('put', v.asset.symbol, i.amount, i.strikePerToken, i.premium, v.expirySec, v.fillSec), signs: 'One WETH approval, then createOffer, both signed in your wallet.', disclaimer: DISCLAIMER }
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
    return { preview: o.kind === 'call' ? `Pay ${eth(o.strikeTotalEth)} plus ${eth(fee)} fee, receive ${o.amount} ${o.symbol}.` : `Deliver ${o.amount} ${o.symbol}, receive ${eth(o.strikeTotalEth - fee)} after the ${FEES.exerciseBps / 100}% fee.`, expiresIn: o.expiresIn, link: `${SITE}/positions?exercise=${id}`, signs: 'Signed in your wallet from the Positions page.', disclaimer: DISCLAIMER }
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

export const READ_TOOLS = [listTokens, findOffers, getOffer, getPositions, getPrices, getChart, getStaking, getProtocolStats, getProof, getActivity, explainOffer, compareOffers] as const
export const PREPARE_TOOLS = [prepareBuy, prepareCoveredCall, prepareCashSecuredPut, prepareExercise, prepareStake] as const
export const ALL_TOOLS = [...READ_TOOLS, ...PREPARE_TOOLS] as const
