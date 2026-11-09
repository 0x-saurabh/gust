// Staker share of Pons creator rewards (docs/STAKER_USDG_SHARE.md). Every 24 h epoch a fixed pool of USDG is split
// across the KYTE stake that was ACTIVE for the whole epoch, pro rata, with a hidden floor and cap per wallet, and
// paid wallet to wallet by the keeper from a treasury-funded payout wallet. No contract holds the USDG.
//
// Eligibility is the StakingPool's own rule: stake is pending until the epoch it was added in ends, then active
// and locked through the next full epoch. So `balancesOf(user).active`, read inside the epoch, is exactly the
// stake that sat through it. The snapshot is taken live in the last minutes of each epoch (no archive node needed);
// if the indexer was down at that moment the epoch is marked `missed` and pays nobody.
import { getAddress } from 'viem'

export const EPOCH = 86_400
const FINAL_LAG = 600 // allocate 10 minutes after the epoch ends
const SNAPSHOT_WINDOW = 180 // take (and refresh) the snapshot in the last 3 minutes of an epoch
const UNITS = 1_000_000n // USDG has 6 decimals
const CENT = 10_000n // shares are rounded down to 0.01 USDG

export const toUnits = (usdg) => BigInt(Math.round(Number(usdg) * 1e6))
export const fromUnits = (u) => Number(u) / 1e6

/**
 * Splits `pool` (USDG base units) across `stakes` (Map account -> bigint stake), pro rata, then:
 *   drop:  anyone whose pro-rata share is under `min` gets nothing (repeat until stable; the sybil guard: rounding
 *          small wallets UP would pay 1,000 dust wallets 1,000 × min),
 *   cap:   anyone above `max` gets `max`; the excess is spread pro rata over the uncapped (water-filling),
 *   floor: each share rounded down to 0.01 USDG. Anything left when everyone is capped stays with the treasury.
 * Pure. Returns { shares: Map account -> bigint, dropped: Set, capped: Set, total: bigint }.
 */
export function allocate(pool, stakes, { min, max }) {
  const shares = new Map(), dropped = new Set(), capped = new Set()
  if (pool <= 0n || !stakes.size) return { shares, dropped, capped, total: 0n }
  let eligible = new Map([...stakes].filter(([, s]) => s > 0n))
  // 1. drop below the minimum until nobody else falls under it
  for (;;) {
    const S = [...eligible.values()].reduce((a, b) => a + b, 0n)
    if (S === 0n) return { shares, dropped, capped, total: 0n }
    const under = [...eligible].filter(([, s]) => (pool * s) / S < min).map(([a]) => a)
    if (!under.length) break
    for (const a of under) { eligible.delete(a); dropped.add(a) }
  }
  // 2. cap at the maximum, redistributing the excess over the uncapped until nobody else crosses it
  let remaining = pool
  let open = new Map(eligible)
  for (;;) {
    const S = [...open.values()].reduce((a, b) => a + b, 0n)
    if (S === 0n) break
    const over = [...open].filter(([, s]) => (remaining * s) / S > max).map(([a]) => a)
    if (!over.length) {
      for (const [a, s] of open) shares.set(a, (remaining * s) / S)
      break
    }
    for (const a of over) { open.delete(a); capped.add(a); shares.set(a, max); remaining -= max }
    if (remaining <= 0n) break
  }
  // 3. round down to the cent; a share that rounds to nothing is dropped
  let total = 0n
  for (const [a, v] of [...shares]) {
    const r = (v / CENT) * CENT
    if (r <= 0n) { shares.delete(a); dropped.add(a); continue }
    shares.set(a, r); total += r
  }
  return { shares, dropped, capped, total }
}

/**
 * deps: { db, all, client, pool (StakingPool address), poolAbi, chainNow() -> sec, log }
 * env: STAKER_SHARE_POOL_USDG (default 0: snapshot only), STAKER_SHARE_MIN_USDG (5), STAKER_SHARE_MAX_USDG (50),
 *      STAKER_SHARE_KEEPER_TOKEN (shared secret for POST /staker-share/paid)
 */
export function installStakerShare({ db, all, client, pool, poolAbi, chainNow, log = console.log, env = process.env }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staker_epochs (epoch INTEGER PRIMARY KEY, pool TEXT, total_active TEXT, stakers INTEGER, participants INTEGER, total TEXT, status TEXT, snapshot_at INTEGER, snapshot_block INTEGER, computed_at INTEGER);
    CREATE TABLE IF NOT EXISTS staker_snapshots (epoch INTEGER, account TEXT, active TEXT, PRIMARY KEY (epoch, account));
    CREATE TABLE IF NOT EXISTS staker_payouts (epoch INTEGER, account TEXT, stake TEXT, amount TEXT, status TEXT, tx TEXT, paid_at INTEGER, PRIMARY KEY (epoch, account));
    CREATE INDEX IF NOT EXISTS staker_payouts_account ON staker_payouts(lower(account), epoch DESC);
    CREATE INDEX IF NOT EXISTS staker_payouts_status ON staker_payouts(status, epoch);
  `)
  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?')
  const setMeta = db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const upEpoch = db.prepare('INSERT OR REPLACE INTO staker_epochs VALUES (?,?,?,?,?,?,?,?,?,?)')
  const delSnap = db.prepare('DELETE FROM staker_snapshots WHERE epoch = ?')
  const insSnap = db.prepare('INSERT OR REPLACE INTO staker_snapshots VALUES (?,?,?)')
  const delPay = db.prepare('DELETE FROM staker_payouts WHERE epoch = ?')
  const insPay = db.prepare('INSERT OR REPLACE INTO staker_payouts VALUES (?,?,?,?,?,?,?)')
  const markPaid = db.prepare("UPDATE staker_payouts SET status = 'paid', tx = ?, paid_at = ? WHERE epoch = ? AND lower(account) = ? AND status = 'due'")

  const now = () => chainNow?.() ?? Math.floor(Date.now() / 1000)
  const currentEpoch = () => Math.floor(now() / EPOCH)
  const isFinal = (epoch) => now() >= (epoch + 1) * EPOCH + FINAL_LAG
  const num = (key, dflt) => { const v = env[key]; return v == null || v === '' ? dflt : v }
  const poolOf = (epoch) => getMeta.get(`stakerShare:pool:${epoch}`)?.value ?? getMeta.get('stakerShare:pool')?.value ?? num('STAKER_SHARE_POOL_USDG', '0')
  const limits = () => ({ min: toUnits(num('STAKER_SHARE_MIN_USDG', '5')), max: toUnits(num('STAKER_SHARE_MAX_USDG', '50')) })
  const KEEPER_TOKEN = env.STAKER_SHARE_KEEPER_TOKEN || ''

  /** Wallets with a positive net stake according to the indexed Staked/Unstaked events. */
  function stakerSet() {
    const net = new Map()
    for (const e of all("SELECT user, type, amount FROM stake_events WHERE type IN ('staked', 'unstaked')")) {
      net.set(e.user, (net.get(e.user) ?? 0n) + (e.type === 'staked' ? 1n : -1n) * BigInt(e.amount))
    }
    return [...net].filter(([, v]) => v > 0n).map(([a]) => getAddress(a))
  }

  /** Reads every staker's active stake now and stores it as the snapshot for the current epoch. */
  async function snapshot(epoch = currentEpoch()) {
    if (!client || !pool) return null
    const who = stakerSet()
    const head = await client.getBlock()
    if (Math.floor(Number(head.timestamp) / EPOCH) !== epoch) return null // the chain already rolled over: too late
    const rows = []
    for (let i = 0; i < who.length; i += 25) {
      const chunk = who.slice(i, i + 25)
      const bal = await Promise.all(chunk.map((a) => client.readContract({ address: pool, abi: poolAbi, functionName: 'balancesOf', args: [a], blockNumber: head.number })))
      chunk.forEach((a, j) => { if (bal[j][0] > 0n) rows.push([a, bal[j][0]]) })
    }
    const totalActive = rows.reduce((s, [, v]) => s + v, 0n)
    db.exec('BEGIN')
    try {
      delSnap.run(epoch)
      for (const [a, v] of rows) insSnap.run(epoch, a, String(v))
      const have = all('SELECT * FROM staker_epochs WHERE epoch = ?', epoch)[0]
      upEpoch.run(epoch, have?.pool ?? poolOf(epoch), String(totalActive), rows.length, have?.participants ?? 0, have?.total ?? '0', 'snapshot', Number(head.timestamp), Number(head.number), have?.computed_at ?? null)
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
    return { epoch, stakers: rows.length, totalActive, block: Number(head.number) }
  }

  /** Allocates a final epoch from its snapshot. Idempotent; recomputes while nothing is paid if the pool changed. */
  function finalize(epoch) {
    if (!isFinal(epoch)) return null
    const have = all('SELECT * FROM staker_epochs WHERE epoch = ?', epoch)[0]
    const pool = poolOf(epoch)
    if (have && (have.status === 'paid' || have.status === 'missed')) return have
    if (have && have.status === 'due' && have.pool === pool) return have
    if (have && have.status === 'due' && all("SELECT 1 FROM staker_payouts WHERE epoch = ? AND status = 'paid' LIMIT 1", epoch).length) return have // money moved: frozen
    if (!have || have.snapshot_at == null) {
      // no snapshot was taken inside the epoch (indexer down): nobody is paid, and it is recorded so
      upEpoch.run(epoch, pool, '0', 0, 0, '0', 'missed', null, null, now())
      log(`[stakerShare] epoch ${epoch}: no snapshot, marked missed`)
      return all('SELECT * FROM staker_epochs WHERE epoch = ?', epoch)[0]
    }
    const stakes = new Map(all('SELECT account, active FROM staker_snapshots WHERE epoch = ?', epoch).map((r) => [r.account, BigInt(r.active)]))
    const { shares, dropped, total } = allocate(toUnits(pool), stakes, limits())
    db.exec('BEGIN')
    try {
      delPay.run(epoch)
      for (const [a, s] of stakes) {
        const amt = shares.get(a)
        insPay.run(epoch, a, String(s), String(amt ?? 0n), amt ? 'due' : 'dropped', null, null)
      }
      upEpoch.run(epoch, pool, have.total_active, have.stakers, shares.size, String(total), shares.size ? 'due' : 'paid', have.snapshot_at, have.snapshot_block, now())
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
    log(`[stakerShare] epoch ${epoch}: ${stakes.size} stakers, ${shares.size} paid, ${dropped.size} under the minimum, ${fromUnits(total)} USDG`)
    return all('SELECT * FROM staker_epochs WHERE epoch = ?', epoch)[0]
  }

  function catchUp() {
    const first = all('SELECT MIN(epoch) AS e FROM staker_epochs')[0]?.e
    if (first == null) return
    for (let e = first; e < currentEpoch(); e++) if (isFinal(e)) finalize(e)
  }

  /** The keeper reports a transfer. Returns the number of rows updated. */
  function paid({ epoch, account, tx }) {
    const r = markPaid.run(tx, now(), epoch, String(account).toLowerCase())
    if (r.changes && !all("SELECT 1 FROM staker_payouts WHERE epoch = ? AND status = 'due' LIMIT 1", epoch).length) {
      db.prepare("UPDATE staker_epochs SET status = 'paid' WHERE epoch = ?").run(epoch)
    }
    return r.changes
  }

  // ---- routes
  const epochOut = (r) => ({
    epoch: r.epoch, startsAt: r.epoch * EPOCH, endsAt: (r.epoch + 1) * EPOCH, poolUsdg: Number(r.pool), totalActive: Number(r.total_active) / 1e18,
    stakers: r.stakers, participants: r.participants, totalUsdg: fromUnits(BigInt(r.total || '0')), status: r.status, snapshotAt: r.snapshot_at, snapshotBlock: r.snapshot_block,
  })
  const payoutOut = (p) => ({ account: p.account, stake: Number(p.stake) / 1e18, amount: p.amount, amountUsdg: fromUnits(BigInt(p.amount)), status: p.status, tx: p.tx, paidAt: p.paid_at })

  /** Live estimate for one wallet from current on-chain state, clamped silently (the floor and cap are never returned). */
  async function estimate(account) {
    if (!client || !pool) return { active: 0, totalActive: 0, estimatedUsdg: 0, qualifies: false }
    const [[active], totalActive] = await Promise.all([
      client.readContract({ address: pool, abi: poolAbi, functionName: 'balancesOf', args: [account] }),
      client.readContract({ address: pool, abi: poolAbi, functionName: 'activeSupply' }),
    ])
    const p = toUnits(poolOf(currentEpoch()))
    const { min, max } = limits()
    let est = totalActive > 0n ? (p * active) / totalActive : 0n
    const qualifies = est >= min
    if (!qualifies) est = 0n
    if (est > max) est = max
    return { active: Number(active) / 1e18, totalActive: Number(totalActive) / 1e18, estimatedUsdg: fromUnits(est), qualifies }
  }

  /** GET /staker-share */
  async function program() {
    catchUp()
    const cur = currentEpoch()
    const rows = all('SELECT * FROM staker_epochs ORDER BY epoch DESC LIMIT 30')
    const due = all("SELECT epoch, COUNT(*) AS n, SUM(CAST(amount AS INTEGER)) AS total FROM staker_payouts WHERE status = 'due' GROUP BY epoch ORDER BY epoch")
    return {
      ok: true, at: now(), token: 'USDG', poolUsdg: Number(poolOf(cur)), payer: env.STAKER_SHARE_PAYER || null,
      rules: { epochSec: EPOCH, finalAfterSec: FINAL_LAG, basis: 'active stake through the whole epoch, pro rata', paidBy: 'direct USDG transfer from the treasury payout wallet; nothing to claim' },
      current: { epoch: cur, startsAt: cur * EPOCH, endsAt: (cur + 1) * EPOCH, poolUsdg: Number(poolOf(cur)) },
      due: due.map((d) => ({ epoch: d.epoch, count: d.n, totalUsdg: fromUnits(BigInt(d.total ?? 0)) })),
      epochs: rows.map(epochOut),
    }
  }

  /** GET /staker-share/epoch/<n>: the payout table (the keeper pays the `due` rows). */
  function epochRoute(epoch) {
    if (!Number.isInteger(epoch) || epoch < 0) return { error: 'bad epoch' }
    if (!isFinal(epoch)) return { epoch, final: false, status: 'live', endsAt: (epoch + 1) * EPOCH, finalAt: (epoch + 1) * EPOCH + FINAL_LAG }
    const r = finalize(epoch)
    return { ...epochOut(r), final: true, payouts: all("SELECT * FROM staker_payouts WHERE epoch = ? AND status != 'dropped' ORDER BY CAST(amount AS INTEGER) DESC", epoch).map(payoutOut) }
  }

  /** GET /staker-share/<address>: estimate today, payout history. */
  async function accountRoute(address) {
    catchUp()
    const account = getAddress(address)
    const cur = currentEpoch()
    const est = await estimate(account)
    const rows = all('SELECT * FROM staker_payouts WHERE lower(account) = ? ORDER BY epoch DESC LIMIT 60', account.toLowerCase())
    const epochs = rows.map((p) => ({ epoch: p.epoch, endsAt: (p.epoch + 1) * EPOCH, ...payoutOut(p) }))
    return {
      ok: true, at: now(), account, token: 'USDG',
      current: { epoch: cur, endsAt: (cur + 1) * EPOCH, poolUsdg: Number(poolOf(cur)), ...est },
      last: epochs.find((e) => e.status === 'paid') ?? null,
      paidUsdg: epochs.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amountUsdg, 0),
      epochs,
    }
  }

  async function handle(u) {
    const m = u.pathname.match(/^\/staker-share(?:\/(epoch\/(\d+)|0x[0-9a-fA-F]{40}))?$/)
    if (!m) return null
    if (!m[1]) return program()
    if (m[2] != null) return epochRoute(Number(m[2]))
    return accountRoute(m[1])
  }

  /** POST /staker-share/paid {epoch, account, tx} with header x-keeper-token. */
  function handlePaid(headers, body) {
    if (!KEEPER_TOKEN || headers['x-keeper-token'] !== KEEPER_TOKEN) return { status: 401, body: { error: 'unauthorized' } }
    const epoch = Number(body?.epoch), account = String(body?.account ?? ''), tx = String(body?.tx ?? '')
    if (!Number.isInteger(epoch) || !/^0x[0-9a-fA-F]{40}$/.test(account) || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return { status: 400, body: { error: 'bad body' } }
    return { status: 200, body: { ok: true, updated: paid({ epoch, account, tx }) } }
  }

  function start() {
    let lastSnap = -1
    const loop = async () => {
      try {
        const cur = currentEpoch()
        const left = (cur + 1) * EPOCH - now()
        if (left <= SNAPSHOT_WINDOW && left > 0) { const r = await snapshot(cur); if (r && lastSnap !== cur) { log(`[stakerShare] epoch ${cur} snapshot: ${r.stakers} stakers, block ${r.block}`); lastSnap = cur } }
        catchUp()
      } catch (e) { log(`[stakerShare] loop: ${e.shortMessage ?? e.message}`) }
      setTimeout(loop, 30_000).unref?.()
    }
    setTimeout(loop, 20_000).unref?.()
  }

  return { handle, handlePaid, start, snapshot, finalize, catchUp, paid, program, epochRoute, accountRoute, estimate, setPool: (epoch, usdg) => setMeta.run(epoch == null ? 'stakerShare:pool' : `stakerShare:pool:${epoch}`, String(usdg)) }
}
