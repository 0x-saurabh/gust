// Seed open offers on the v3 markets of the local fork, from the seeder personas (anvil #2-#4).
//
//   node video/env/seed.mjs          # RPC_URL (default http://127.0.0.1:8549), INDEXER_URL (default http://127.0.0.1:4299)
//
// Spot prices: the indexer's /prices (Robinhood Stock Token quotes / ETH-USD), else the same sources directly.
// Strikes sit around spot, 1-week expiry, fill window = until expiry, premiums from Black-Scholes at 45% vol.
// Writes $DEMO_DIR/seeded.json (default $CLAUDE_JOB_DIR/tmp/demo/seeded.json). Run fund.mjs first.
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, parseUnits, decodeEventLog, getAddress } from 'viem'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const RPC = process.env.RPC_URL || 'http://127.0.0.1:8549'
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(RPC)) throw new Error(`refusing non-local RPC ${RPC}`)
const INDEXER = process.env.INDEXER_URL || 'http://127.0.0.1:4299'
const DEMO_DIR = process.env.DEMO_DIR || path.join(process.env.CLAUDE_JOB_DIR || '/Users/apple/.claude/jobs/9eeca95c', 'tmp/demo')
const dep = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts/deployments/4663.json'), 'utf8'))
const V3 = dep.v3
const TOKENS = {
  NVDA: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
  AAPL: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
  TSLA: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d',
}
const SEEDERS = ['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', '0x90F79bf6EB2c4f870365E785982E1f101E93b906', '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65']

const abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function createOffer(address token, uint256 amount, uint256 strike, uint256 premium, uint64 expiry, uint64 offerDeadline) returns (uint256)',
  'function createPutOfferWithETH(address token, uint256 amount, uint256 strike, uint256 premium, uint64 expiry, uint64 offerDeadline) payable returns (uint256)',
  'event OfferCreated(uint256 indexed id, address indexed seller, address indexed token, uint256 amount, uint256 strike, uint256 premium, uint64 expiry, uint64 offerDeadline)',
])
const marketAbi = JSON.parse(fs.readFileSync(path.join(ROOT, 'indexer/abis/CallMarket.json'), 'utf8')).abi

const transport = http(RPC)
const pub = createPublicClient({ transport })
const chainId = await pub.getChainId()
if (chainId !== 4663) throw new Error(`expected the Robinhood Chain fork (4663), RPC is chain ${chainId}`)
const chain = { id: 4663, name: 'Robinhood Chain (fork)', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }

async function spots() {
  try {
    const r = await fetch(`${INDEXER}/prices`, { signal: AbortSignal.timeout(4000) })
    const p = await r.json()
    if (['NVDA', 'AAPL', 'TSLA'].every((s) => p[s]?.price > 0)) return { NVDA: p.NVDA.price, AAPL: p.AAPL.price, TSLA: p.TSLA.price, source: 'indexer' }
  } catch {}
  const [{ quotes }, cb] = await Promise.all([
    fetch('https://api.robinhood.com/rhj/prices').then((r) => r.json()),
    fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot').then((r) => r.json()),
  ])
  const usd = Number(cb.data.amount)
  const out = { source: 'robinhood' }
  for (const [sym, addr] of Object.entries(TOKENS)) {
    const qt = quotes.find((x) => x.deployments?.some((d) => d.contractAddress.toLowerCase() === addr.toLowerCase()))
    out[sym] = ((Number(qt.bid) + Number(qt.ask)) / 2) / usd
  }
  return out
}

function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2))
  const e = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2)
  return 0.5 * (1 + (x < 0 ? -e : e))
}
function bs(spot, strike, years, vol, kind) {
  const sd = vol * Math.sqrt(years)
  const d1 = (Math.log(spot / strike) + (sd * sd) / 2) / sd
  const d2 = d1 - sd
  return kind === 'call' ? spot * normCdf(d1) - strike * normCdf(d2) : strike * normCdf(-d2) - spot * normCdf(-d1)
}
const sig = (x, n = 3) => Number(x.toPrecision(n))

// [label, kind, symbol, amount, strike vs spot, seeder index]. The first is the buy-scene offer.
const PLAN = [
  ['buy-scene', 'call', 'NVDA', 2, 1.03, 0],
  ['nvda-5', 'call', 'NVDA', 5, 1.08, 1],
  ['', 'put', 'NVDA', 3, 0.94, 2],
  ['', 'call', 'AAPL', 2, 1.05, 1],
  ['', 'put', 'AAPL', 2, 0.95, 0],
  ['', 'call', 'TSLA', 2, 1.06, 2],
  ['', 'put', 'TSLA', 2, 0.95, 1],
  ['nvda-10', 'call', 'NVDA', 10, 1.1, 0],
]

// ONLY=buy-scene[,nvda-5,nvda-10]: add just these offers again (e.g. after a rehearsal bought them); seeded.json
// keeps the earlier entries (re-added labels get ' (old)') and buyScene points at the newest buy-scene offer.
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
const plan = ONLY ? PLAN.filter((p) => ONLY.includes(p[0])) : PLAN
const s = await spots()
console.log(`[seed] spot (ETH) NVDA ${s.NVDA.toPrecision(4)}  AAPL ${s.AAPL.toPrecision(4)}  TSLA ${s.TSLA.toPrecision(4)}  via ${s.source}`)
const head = await pub.getBlock()
const now = Number(head.timestamp)
const WEEK = 7 * 86400
const results = []
for (const [label, kind, sym, amount, k, si] of plan) {
  const seller = SEEDERS[si]
  const wallet = createWalletClient({ account: seller, chain, transport })
  const strikeEach = sig(s[sym] * k, 3)
  const strikeTotal = strikeEach * amount
  const premium = Math.max(0.0005, sig(bs(s[sym], strikeEach, WEEK / (365 * 86400), 0.45, kind) * amount * 1.05, 2))
  const amountRaw = parseUnits(String(amount), 18)
  const strikeRaw = parseEther(strikeTotal.toFixed(18))
  const premiumRaw = parseEther(premium.toFixed(18))
  const expiry = BigInt(now + WEEK)
  let hash
  if (kind === 'call') {
    const ah = await wallet.writeContract({ address: TOKENS[sym], abi, functionName: 'approve', args: [V3.callMarket, amountRaw] })
    await pub.waitForTransactionReceipt({ hash: ah })
    hash = await wallet.writeContract({ address: V3.callMarket, abi, functionName: 'createOffer', args: [TOKENS[sym], amountRaw, strikeRaw, premiumRaw, expiry, expiry] })
  } else {
    hash = await wallet.writeContract({ address: V3.router, abi, functionName: 'createPutOfferWithETH', args: [TOKENS[sym], amountRaw, strikeRaw, premiumRaw, expiry, expiry], value: strikeRaw })
  }
  const rcpt = await pub.waitForTransactionReceipt({ hash })
  if (rcpt.status !== 'success') throw new Error(`${kind} ${sym} reverted (${hash})`)
  let id
  for (const log of rcpt.logs) {
    try {
      const d = decodeEventLog({ abi: marketAbi, data: log.data, topics: log.topics })
      if (d.eventName === 'OfferCreated') id = d.args.id
    } catch {}
  }
  if (id == null) throw new Error(`no OfferCreated in ${hash}`)
  const row = { id: id.toString(), label: label || undefined, kind, symbol: sym, amount, strikePerToken: strikeEach, strikeTotal: sig(strikeTotal, 6), premium, seller: getAddress(seller), expiry: Number(expiry), tx: hash }
  results.push(row)
  console.log(`[seed] ${kind.padEnd(4)} ${String(amount).padStart(2)} ${sym}  strike ${strikeEach} ETH/token  premium ${premium} ETH  id ${row.id}${label ? '  <- ' + label : ''}`)
}
fs.mkdirSync(DEMO_DIR, { recursive: true })
const file = path.join(DEMO_DIR, 'seeded.json')
const prev = ONLY && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
const offers = prev ? [...results, ...prev.offers.map((o) => (ONLY.includes(o.label) ? { ...o, label: `${o.label} (old)` } : o))] : results
const out = { createdAt: new Date().toISOString(), spotEth: s, buyScene: results.find((r) => r.label === 'buy-scene')?.id ?? prev?.buyScene, offers }
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
console.log(`[seed] wrote ${file}`)
