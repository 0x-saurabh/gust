// Staker share allocation and epoch lifecycle against a scratch SQLite db shaped like the indexer's.
//   node --test tests/staker-share.test.ts
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { EPOCH, allocate, installStakerShare, toUnits } from '../indexer/src/stakerShare.mjs'

const U = (n: number) => toUnits(String(n))
const K = (n: number) => BigInt(n) * 10n ** 18n
const addr = (i: number) => `0x${String(i).padStart(40, '0')}`
const LIM = { min: U(5), max: U(50) }

test('allocate: pro rata, drops below the minimum, caps at the maximum and redistributes, never exceeds the pool', () => {
  // 200 USDG over 100 M active: 5 M -> 10 USDG, 60 M -> 120 capped at 50, the excess goes to the others
  const stakes = new Map([[addr(1), K(5_000_000)], [addr(2), K(35_000_000)], [addr(3), K(60_000_000)]])
  const r = allocate(U(200), stakes, LIM)
  assert.equal(r.shares.get(addr(3)), U(50))
  assert.ok(r.capped.has(addr(3)))
  // the remaining 150 splits 5:35 -> 18.75 and 131.25 -> 131.25 is over the cap too: 50, then 100 left for #1 alone, capped at 50
  assert.equal(r.shares.get(addr(2)), U(50))
  assert.equal(r.shares.get(addr(1)), U(50))
  assert.equal(r.total, U(150)) // everyone capped: 50 USDG stays with the treasury
  // small staker: 1 M of 500 M -> 0.4 USDG, dropped; the rest split the pool
  const s2 = new Map([[addr(1), K(1_000_000)], [addr(2), K(249_000_000)], [addr(3), K(250_000_000)]])
  const r2 = allocate(U(200), s2, LIM)
  assert.ok(r2.dropped.has(addr(1)))
  assert.equal(r2.shares.get(addr(2)), U(50)); assert.equal(r2.shares.get(addr(3)), U(50))
  // uncapped case sums to the pool within rounding
  const s3 = new Map(Array.from({ length: 8 }, (_, i) => [addr(i + 1), K(10_000_000 + i * 1_000_000)] as [string, bigint]))
  const r3 = allocate(U(200), s3, LIM)
  assert.equal(r3.capped.size, 0); assert.equal(r3.dropped.size, 0)
  assert.ok(r3.total <= U(200) && r3.total >= U(199.9), String(r3.total))
  for (const v of r3.shares.values()) assert.equal(v % 10_000n, 0n) // cents
})

test('allocate: a thousand dust wallets earn nothing (rounding up would pay 5,000 USDG)', () => {
  const stakes = new Map(Array.from({ length: 1000 }, (_, i) => [addr(i + 1), K(1)] as [string, bigint]))
  stakes.set(addr(5000), K(10_000_000))
  const r = allocate(U(200), stakes, LIM)
  assert.equal(r.shares.size, 1)
  assert.equal(r.shares.get(addr(5000)), U(50))
  assert.equal(r.dropped.size, 1000)
  assert.equal(allocate(0n, stakes, LIM).total, 0n)
  assert.equal(allocate(U(200), new Map(), LIM).total, 0n)
})

function scratch() {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE stake_events (key TEXT PRIMARY KEY, tx TEXT, user TEXT, type TEXT, amount TEXT, block INTEGER, at INTEGER);`)
  const all = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...(a as never[]))
  return { db, all }
}
// a fake viem client: balancesOf per account, activeSupply, and a block inside the epoch under test
function fakeClient(active: Record<string, bigint>, ts: number) {
  return {
    getBlock: async () => ({ number: 123n, timestamp: BigInt(ts) }),
    readContract: async ({ functionName, args }: { functionName: string; args?: string[] }) => {
      if (functionName === 'balancesOf') return [active[args![0]] ?? 0n, 0n]
      if (functionName === 'activeSupply') return Object.values(active).reduce((a, b) => a + b, 0n)
      throw new Error(functionName)
    },
  }
}

test('epoch lifecycle: snapshot inside the epoch, allocation after it, keeper records payments, missed epochs pay nobody', async () => {
  const { db, all } = scratch()
  const E = 20_000, end = (E + 1) * EPOCH
  let now = end - 100
  for (const [i, a] of [addr(1), addr(2), addr(3)].entries()) db.prepare('INSERT INTO stake_events VALUES (?,?,?,?,?,?,?)').run(`s${i}`, '0x', a, 'staked', String(K(1)), 1, 0)
  db.prepare('INSERT INTO stake_events VALUES (?,?,?,?,?,?,?)').run('u3', '0x', addr(3), 'unstaked', String(K(1)), 1, 0) // net zero: not polled
  const active = { [addr(1)]: K(5_000_000), [addr(2)]: K(95_000_000) }
  const env = { STAKER_SHARE_POOL_USDG: '200', STAKER_SHARE_KEEPER_TOKEN: 'secret' }
  const ss = installStakerShare({ db, all, client: fakeClient(active, now), pool: '0xpool', poolAbi: [], chainNow: () => now, log: () => {}, env })
  const snap = await ss.snapshot()
  assert.equal(snap!.stakers, 2)
  assert.equal(ss.finalize(E), null) // not final yet
  now = end + 700
  const fin = ss.finalize(E)!
  assert.equal(fin.status, 'due'); assert.equal(fin.participants, 2)
  const table = ss.epochRoute(E) as { payouts: Array<{ account: string; amountUsdg: number; status: string }> }
  const one = table.payouts.find((p) => p.account === addr(1))!, two = table.payouts.find((p) => p.account === addr(2))!
  assert.equal(two.amountUsdg, 50); assert.equal(one.amountUsdg, 50) // 95% = 190 -> capped 50; the 150 left flows to #1, capped too; 100 stays in treasury
  assert.equal(fin.total, String(U(100)))
  // the estimate for the live epoch is clamped silently
  const est = await ss.estimate(addr(2))
  assert.equal(est.estimatedUsdg, 50); assert.equal(est.qualifies, true)
  // the keeper reports payments
  assert.equal(ss.handlePaid({ 'x-keeper-token': 'nope' }, { epoch: E, account: addr(1), tx: '0x' + '1'.repeat(64) }).status, 401)
  assert.equal(ss.handlePaid({ 'x-keeper-token': 'secret' }, { epoch: E, account: addr(1), tx: '0x' + '1'.repeat(64) }).body.updated, 1)
  assert.equal(ss.handlePaid({ 'x-keeper-token': 'secret' }, { epoch: E, account: addr(1), tx: '0x' + '1'.repeat(64) }).body.updated, 0) // idempotent
  // a pool change after money moved does not recompute
  ss.setPool(E, '400')
  assert.equal((ss.finalize(E) as { total: string }).total, String(U(100)))
  ss.handlePaid({ 'x-keeper-token': 'secret' }, { epoch: E, account: addr(2), tx: '0x' + '2'.repeat(64) })
  assert.equal(ss.finalize(E)!.status, 'paid')
  const acct = await ss.accountRoute(addr(1))
  assert.equal(acct.paidUsdg, 50); assert.equal(acct.last!.tx, '0x' + '1'.repeat(64))
  // the next epoch had no snapshot (indexer down): missed, nobody paid, and the one after that is scored normally
  now = (E + 2) * EPOCH + 700
  assert.equal(ss.finalize(E + 1)!.status, 'missed')
  const prog = await ss.program()
  assert.equal(prog.due.length, 0)
  assert.deepEqual(prog.epochs.map((e: { epoch: number }) => e.epoch), [E + 1, E])
  db.close()
})
