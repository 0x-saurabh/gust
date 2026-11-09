// USDG trading rewards (docs/USDG_REWARDS.md). One pool of USDG per 24 h protocol epoch, split pro rata by points
// that are weighted by the fees actually paid (fees are real cost: the sybil filter). The indexer scores every epoch
// from the events it already stores, builds the Merkle tree once an epoch is final, serves /rewards, and the keeper
// publishes the root to UsdgRewards. Amounts are USDG base units (6 decimals).
import { getAddress, parseAbi } from 'viem'
import { buildTree, leafHash } from './merkle.mjs'

export const EPOCH = 86_400
const POINT_WEI = 1e14 // 1 point per 0.0001 ETH of fee
const OI_WEIGHT = 0.2 // per epoch a position stays open, both sides
const STOCK_PUT_MULT = 1.5 // a cash-secured put written on a stock token
const MIN_CLAIM_UNITS = 10_000n // 0.01 USDG: smaller shares are dropped (dust)
const FINAL_LAG = 600 // an epoch is scored 10 minutes after it ends, so the chain reads have caught up
const DEFAULT_POOL = process.env.REWARDS_POOL_USDG || '0' // USDG per epoch, e.g. "285.71" (2,000 a week); 0 = score only
const LEAF_TYPES = [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }]
const REWARDS_ABI = parseAbi([
  'function epochs(uint256) view returns (bytes32 root, uint128 total, uint128 claimed, uint64 publishedAt, uint64 expiresAt, bool swept)',
  'function isClaimed(uint256 epoch, address account) view returns (bool)',
  'function available() view returns (uint256)',
  'function outstanding() view returns (uint256)',
])

export const toUnits = (usdg) => BigInt(Math.round(Number(usdg) * 1e6))
export const fromUnits = (u) => Number(u) / 1e6

/** deps: { db, all, client, contract?, isStock(address) -> bool, chainNow() -> sec, log } */
export function installRewards({ db, all, client, contract = null, isStock = () => false, chainNow, log = console.log }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_epochs (epoch INTEGER PRIMARY KEY, pool TEXT, total_points REAL, participants INTEGER, root TEXT, total TEXT, computed_at INTEGER);
    CREATE TABLE IF NOT EXISTS reward_leaves (epoch INTEGER, account TEXT, points REAL, fee_eth REAL, amount TEXT, proof TEXT, detail TEXT, PRIMARY KEY (epoch, account));
    CREATE INDEX IF NOT EXISTS reward_leaves_account ON reward_leaves(lower(account), epoch DESC);
  `)
  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?')
  const setMeta = db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const upEpoch = db.prepare('INSERT OR REPLACE INTO reward_epochs VALUES (?,?,?,?,?,?,?)')
  const delLeaves = db.prepare('DELETE FROM reward_leaves WHERE epoch = ?')
  const insLeaf = db.prepare('INSERT OR REPLACE INTO reward_leaves VALUES (?,?,?,?,?,?,?)')

  const now = () => chainNow?.() ?? Math.floor(Date.now() / 1000)
  const currentEpoch = () => Math.floor(now() / EPOCH)
  const isFinal = (epoch) => now() >= (epoch + 1) * EPOCH + FINAL_LAG
  /** USDG for an epoch: meta override (rewards:pool:<epoch>), else the default. */
  const poolOf = (epoch) => getMeta.get(`rewards:pool:${epoch}`)?.value ?? getMeta.get('rewards:pool')?.value ?? DEFAULT_POOL

  // ---- scoring
  /** Points per account for one epoch, from fees paid in it and positions open through its end. Pure over the db. */
  function score(epoch) {
    const start = epoch * EPOCH, end = start + EPOCH
    const acc = new Map() // account -> { points, feeEth, detail }
    const add = (who, pts, feeWei, what) => {
      if (!who || pts <= 0) return
      const a = getAddress(who)
      const r = acc.get(a) ?? { points: 0, feeEth: 0, detail: {} }
      r.points += pts; r.feeEth += Number(feeWei) / 1e18; r.detail[what] = (r.detail[what] ?? 0) + pts
      acc.set(a, r)
    }
    // 1. fills in the epoch: buyer and seller each earn the fee paid on the premium; a put written on a stock token 1.5x for its seller
    for (const e of all("SELECT e.args, o.seller, o.kind, o.token FROM events e JOIN offers o ON o.id = json_extract(e.args, '$.id') WHERE e.name = 'OptionBought' AND e.at >= ? AND e.at < ?", start, end)) {
      const a = JSON.parse(e.args)
      const fee = Number(a.fee ?? 0)
      const pts = fee / POINT_WEI
      add(a.buyer, pts, fee, 'bought')
      add(e.seller, pts * (e.kind === 'put' && isStock(e.token) ? STOCK_PUT_MULT : 1), fee, e.kind === 'put' ? 'wrote_put' : 'wrote_call')
    }
    // 2. open interest carried through the epoch end: filled before the end, not settled before the end, expiring after it
    for (const o of all(`SELECT o.seller, o.premium_fee, b.args AS bought, b.at AS bought_at FROM offers o
        JOIN events b ON b.name = 'OptionBought' AND json_extract(b.args, '$.id') = o.id
        WHERE b.at < ? AND o.expiry > ?
          AND NOT EXISTS (SELECT 1 FROM events s WHERE s.name IN ('Exercised', 'Expired') AND json_extract(s.args, '$.id') = o.id AND s.at < ?)`, end, end, end)) {
      const fee = Number(o.premium_fee ?? 0)
      const pts = (fee / POINT_WEI) * OI_WEIGHT
      add(JSON.parse(o.bought).buyer, pts, 0, 'held')
      add(o.seller, pts, 0, 'held')
    }
    return acc
  }

  /** Scores a final epoch, splits the pool, builds the tree and stores leaves. Idempotent; recomputes if the pool changed. */
  function finalize(epoch) {
    const pool = poolOf(epoch)
    const have = all('SELECT * FROM reward_epochs WHERE epoch = ?', epoch)[0]
    if (have && have.pool === pool) return have
    const acc = score(epoch)
    const totalPoints = [...acc.values()].reduce((s, r) => s + r.points, 0)
    const poolUnits = toUnits(pool)
    const leaves = []
    for (const [account, r] of acc) {
      const amount = totalPoints > 0 && poolUnits > 0n ? (poolUnits * BigInt(Math.round(r.points * 1e9))) / BigInt(Math.round(totalPoints * 1e9)) : 0n
      leaves.push({ account, points: r.points, feeEth: r.feeEth, amount: amount >= MIN_CLAIM_UNITS ? amount : 0n, detail: r.detail })
    }
    const paid = leaves.filter((l) => l.amount > 0n)
    const hashes = paid.map((l) => leafHash(LEAF_TYPES, [BigInt(epoch), l.account, l.amount]))
    const tree = buildTree(hashes)
    const total = paid.reduce((s, l) => s + l.amount, 0n)
    const tx = db.exec.bind(db)
    tx('BEGIN')
    try {
      delLeaves.run(epoch)
      paid.forEach((l, i) => insLeaf.run(epoch, l.account, l.points, l.feeEth, String(l.amount), JSON.stringify(tree.proofOf(hashes[i])), JSON.stringify(l.detail)))
      for (const l of leaves.filter((l) => l.amount === 0n)) insLeaf.run(epoch, l.account, l.points, l.feeEth, '0', '[]', JSON.stringify(l.detail))
      upEpoch.run(epoch, pool, totalPoints, acc.size, tree.root, String(total), now())
      tx('COMMIT')
    } catch (e) { tx('ROLLBACK'); throw e }
    if (paid.length) log(`[rewards] epoch ${epoch}: ${acc.size} accounts, ${totalPoints.toFixed(2)} points, ${fromUnits(total)} USDG, root ${tree.root}`)
    return all('SELECT * FROM reward_epochs WHERE epoch = ?', epoch)[0]
  }

  /** Finalizes every finished epoch since the first fill that has no row yet (or whose pool changed). */
  function catchUp() {
    const first = all("SELECT MIN(at) AS t FROM events WHERE name = 'OptionBought'")[0]?.t
    if (!first) return
    // REWARDS_FIRST_EPOCH (or the meta key) is the first epoch that pays: epochs before it are never scored into trees,
    // so switching the pool on does not back-pay every epoch since the first fill (docs/USDG_REWARDS_FUNDING.md)
    const from = Math.max(Math.floor(first / EPOCH), Number(getMeta.get('rewards:first_epoch')?.value ?? process.env.REWARDS_FIRST_EPOCH ?? 0))
    for (let e = from; e < currentEpoch(); e++) if (isFinal(e)) finalize(e)
  }

  // ---- chain state (published roots, claims)
  async function onChain(epoch) {
    if (!contract) return null
    try {
      const [root, total, claimed, publishedAt, expiresAt, swept] = await client.readContract({ address: contract, abi: REWARDS_ABI, functionName: 'epochs', args: [BigInt(epoch)] })
      if (root === '0x' + '0'.repeat(64)) return { published: false }
      return { published: true, root, total: String(total), claimed: String(claimed), publishedAt: Number(publishedAt), expiresAt: Number(expiresAt), swept }
    } catch { return null }
  }
  async function claimedOnChain(epoch, account) {
    if (!contract) return false
    return client.readContract({ address: contract, abi: REWARDS_ABI, functionName: 'isClaimed', args: [BigInt(epoch), account] }).catch(() => false)
  }

  // ---- routes
  const epochOut = (r, chain) => ({
    epoch: r.epoch, startsAt: r.epoch * EPOCH, endsAt: (r.epoch + 1) * EPOCH, poolUsdg: Number(r.pool), totalPoints: r.total_points, participants: r.participants,
    root: r.root, totalUsdg: fromUnits(BigInt(r.total || '0')), computedAt: r.computed_at,
    status: chain?.swept ? 'swept' : chain?.published ? 'claimable' : 'final',
    ...(chain?.published ? { claimedUsdg: fromUnits(BigInt(chain.claimed)), expiresAt: chain.expiresAt, publishedAt: chain.publishedAt } : {}),
  })

  /** GET /rewards */
  async function program() {
    catchUp()
    const cur = currentEpoch()
    const live = score(cur)
    const livePoints = [...live.values()].reduce((s, r) => s + r.points, 0)
    const rows = all('SELECT * FROM reward_epochs ORDER BY epoch DESC LIMIT 30')
    const chain = await Promise.all(rows.map((r) => onChain(r.epoch)))
    let avail = null
    if (contract) avail = await client.readContract({ address: contract, abi: REWARDS_ABI, functionName: 'available' }).then((v) => fromUnits(v)).catch(() => null)
    return {
      ok: true, at: now(), token: 'USDG', contract, poolUsdg: Number(poolOf(cur)), availableUsdg: avail,
      rules: { pointPerEthFee: 1 / (POINT_WEI / 1e18), openInterestWeight: OI_WEIGHT, stockPutMultiplier: STOCK_PUT_MULT, minClaimUsdg: fromUnits(MIN_CLAIM_UNITS), epochSec: EPOCH, finalAfterSec: FINAL_LAG },
      current: { epoch: cur, startsAt: cur * EPOCH, endsAt: (cur + 1) * EPOCH, poolUsdg: Number(poolOf(cur)), totalPoints: livePoints, participants: live.size },
      epochs: rows.map((r, i) => epochOut(r, chain[i])),
    }
  }

  /** GET /rewards/epoch/<n>: the tree (every leaf with its proof), for the keeper and for anyone who wants to check. */
  async function epochRoute(epoch) {
    if (!Number.isInteger(epoch) || epoch < 0) return { error: 'bad epoch' }
    if (!isFinal(epoch)) return { epoch, final: false, status: 'live', endsAt: (epoch + 1) * EPOCH, finalAt: (epoch + 1) * EPOCH + FINAL_LAG }
    const r = finalize(epoch)
    const chain = await onChain(epoch)
    return { ...epochOut(r, chain), final: true, total: r.total, leaves: all("SELECT account, points, fee_eth, amount, proof, detail FROM reward_leaves WHERE epoch = ? AND amount != '0' ORDER BY CAST(amount AS INTEGER) DESC", epoch).map((l) => ({ account: l.account, points: l.points, feeEth: l.fee_eth, amount: l.amount, amountUsdg: fromUnits(BigInt(l.amount)), proof: JSON.parse(l.proof), detail: JSON.parse(l.detail) })) }
  }

  /** GET /rewards/<address>: this epoch's live estimate, claimable epochs with proofs, and history. */
  async function accountRoute(address) {
    catchUp()
    const account = getAddress(address)
    const cur = currentEpoch()
    const live = score(cur)
    const mine = live.get(account)
    const livePoints = [...live.values()].reduce((s, r) => s + r.points, 0)
    const pool = Number(poolOf(cur))
    const rows = all('SELECT l.*, e.pool, e.total_points FROM reward_leaves l JOIN reward_epochs e ON e.epoch = l.epoch WHERE lower(l.account) = ? ORDER BY l.epoch DESC LIMIT 60', account.toLowerCase())
    const chain = await Promise.all(rows.map((r) => onChain(r.epoch)))
    const claimed = await Promise.all(rows.map((r, i) => (chain[i]?.published && r.amount !== '0' ? claimedOnChain(r.epoch, account) : false)))
    const epochs = rows.map((r, i) => ({
      epoch: r.epoch, endsAt: (r.epoch + 1) * EPOCH, points: r.points, share: r.total_points > 0 ? r.points / r.total_points : 0, feeEth: r.fee_eth, detail: JSON.parse(r.detail),
      amount: r.amount, amountUsdg: fromUnits(BigInt(r.amount)), proof: JSON.parse(r.proof),
      status: r.amount === '0' ? 'dust' : claimed[i] ? 'claimed' : chain[i]?.swept || (chain[i]?.expiresAt && chain[i].expiresAt < now()) ? 'expired' : chain[i]?.published ? 'claimable' : 'pending',
      expiresAt: chain[i]?.expiresAt ?? null,
    }))
    const claimable = epochs.filter((e) => e.status === 'claimable')
    return {
      ok: true, at: now(), account, contract, token: 'USDG',
      current: { epoch: cur, endsAt: (cur + 1) * EPOCH, points: mine?.points ?? 0, share: livePoints > 0 && mine ? mine.points / livePoints : 0, estimatedUsdg: livePoints > 0 && mine ? (pool * mine.points) / livePoints : 0, feeEth: mine?.feeEth ?? 0, detail: mine?.detail ?? {}, poolUsdg: pool },
      claimable, claimableUsdg: claimable.reduce((s, e) => s + e.amountUsdg, 0),
      claimedUsdg: epochs.filter((e) => e.status === 'claimed').reduce((s, e) => s + e.amountUsdg, 0),
      epochs,
    }
  }

  /** Dispatches /rewards, /rewards/epoch/<n>, /rewards/<address>. */
  async function handle(u) {
    const m = u.pathname.match(/^\/rewards(?:\/(epoch\/(\d+)|0x[0-9a-fA-F]{40}))?$/)
    if (!m) return null
    if (!m[1]) return program()
    if (m[2] != null) return epochRoute(Number(m[2]))
    return accountRoute(m[1])
  }

  function start() {
    const loop = () => { try { catchUp() } catch (e) { log(`[rewards] catch-up: ${e.message}`) }; setTimeout(loop, 300_000).unref?.() }
    setTimeout(loop, 30_000).unref?.()
  }

  return { handle, start, score, finalize, catchUp, program, epochRoute, accountRoute, setPool: (epoch, usdg) => setMeta.run(epoch == null ? 'rewards:pool' : `rewards:pool:${epoch}`, String(usdg)) }
}
