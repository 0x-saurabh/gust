// USDG rewards scoring and Merkle trees against a scratch SQLite db shaped like the indexer's.
//   node --test tests/rewards.test.ts
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { buildTree, leafHash, verify } from '../indexer/src/merkle.mjs'
import { EPOCH, installRewards } from '../indexer/src/rewards.mjs'

const T = [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }]
const A = '0x1111111111111111111111111111111111111111', B = '0x2222222222222222222222222222222222222222', C = '0x3333333333333333333333333333333333333333'
const STOCK = '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', MEME = '0x39dBED3a2bd333467115dE45665cC57F813C4571'

function scratch() {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE offers (id TEXT PRIMARY KEY, kind TEXT, market TEXT, seller TEXT, token TEXT, symbol TEXT, decimals INTEGER, amount TEXT, strike TEXT, premium TEXT, expiry INTEGER, deadline INTEGER, status TEXT, holder TEXT, premium_fee TEXT, exercise_fee TEXT, created_block INTEGER, created_at INTEGER, created_tx TEXT, updated_block INTEGER);
    CREATE TABLE events (key TEXT PRIMARY KEY, name TEXT, block INTEGER, log_index INTEGER, at INTEGER, tx TEXT, args TEXT);`)
  const all = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...(a as never[]))
  const offer = (id: string, kind: string, seller: string, token: string, premiumFee: string, expiry: number) =>
    db.prepare('INSERT INTO offers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, kind, '0xm', seller, token, 'T', 18, '1', '1', '1', expiry, expiry, 'filled', null, premiumFee, null, 1, 0, '0x', 1)
  const ev = (key: string, name: string, at: number, args: Record<string, unknown>) => db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?)').run(key, name, 1, 0, at, '0x', JSON.stringify(args))
  return { db, all, offer, ev }
}

test('merkle: proofs verify, odd leaf counts and duplicates are fine, wrong leaf fails', () => {
  for (const n of [1, 2, 3, 5, 8]) {
    const leaves = Array.from({ length: n }, (_, i) => leafHash(T, [1n, `0x${String(i + 1).padStart(40, '0')}`, BigInt(i + 1) * 1_000_000n]))
    const t = buildTree([...leaves, leaves[0]]) // a duplicate collapses
    for (const l of leaves) assert.ok(verify(t.proofOf(l)!, t.root!, l), `n=${n}`)
    assert.equal(verify(t.proofOf(leaves[0])!, t.root!, leafHash(T, [1n, A, 1n])), false)
  }
  assert.equal(buildTree([]).root, null)
})

test('scoring: fees paid make points, stock puts 1.5x for the writer, open interest carries 0.2x, pool splits pro rata into a tree', () => {
  const { db, all, offer, ev } = scratch()
  const E = 20_000 // epoch under test
  const start = E * EPOCH
  let now = (E + 1) * EPOCH + 700 // final
  const r = installRewards({ db, all, client: null, contract: null, isStock: (t: string) => t.toLowerCase() === STOCK.toLowerCase(), chainNow: () => now })
  // A buys a call from B on a meme token: fee 0.001 ETH -> 10 points each
  offer('1', 'call', B, MEME, '1000000000000000', start + 5 * 86400); ev('e1', 'OptionBought', start + 100, { id: '1', buyer: A, premium: '1', fee: '1000000000000000' })
  // C buys a put from A on a stock token: fee 0.002 ETH -> 20 points to C, 30 to A (1.5x)
  offer('2', 'put', A, STOCK, '2000000000000000', start + 5 * 86400); ev('e2', 'OptionBought', start + 200, { id: '2', buyer: C, premium: '1', fee: '2000000000000000' })
  // a position from the previous epoch, still open through this epoch's end: 0.2 x 10 = 2 points to holder B and seller C
  offer('3', 'call', C, MEME, '1000000000000000', start + 3 * 86400); ev('e3', 'OptionBought', start - 3600, { id: '3', buyer: B, premium: '1', fee: '1000000000000000' })
  // one that settled before the end does not carry
  offer('4', 'call', C, MEME, '1000000000000000', start + 3 * 86400); ev('e4', 'OptionBought', start - 3600, { id: '4', buyer: B, premium: '1', fee: '1000000000000000' }); ev('e5', 'Exercised', start + 50, { id: '4' })
  // a fill after the epoch does not count
  offer('5', 'call', B, MEME, '9000000000000000', start + 9 * 86400); ev('e6', 'OptionBought', start + EPOCH + 1, { id: '5', buyer: A, premium: '1', fee: '9000000000000000' })
  const s = r.score(E)
  // positions 1, 2 and 3 count in this epoch's OI too (all bought before the end, expire after it): 1 -> A,B +2; 2 -> C,A +4; 3 -> B,C +2
  assert.equal(s.get(A)!.points.toFixed(3), (10 + 30 + 2 + 4).toFixed(3))
  assert.equal(s.get(B)!.points.toFixed(3), (10 + 2 + 2).toFixed(3))
  assert.equal(s.get(C)!.points.toFixed(3), (20 + 4 + 2).toFixed(3))
  assert.equal(s.get(A)!.detail.wrote_put, 30)
  // pool 100 USDG: A 46/86, B 14/86, C 26/86
  r.setPool(E, '100')
  const fin = r.finalize(E)
  assert.equal(fin.participants, 3)
  const leaves = all('SELECT * FROM reward_leaves WHERE epoch = ? ORDER BY account', E) as Array<{ account: string; amount: string; proof: string }>
  const total = leaves.reduce((x, l) => x + BigInt(l.amount), 0n)
  assert.ok(total <= 100_000_000n && total >= 99_999_000n, `total ${total}`)
  assert.equal(BigInt(fin.total), total)
  for (const l of leaves) assert.ok(verify(JSON.parse(l.proof), fin.root, leafHash(T, [BigInt(E), l.account, BigInt(l.amount)])), `proof for ${l.account}`)
  // idempotent, and recomputed when the pool changes
  assert.equal(r.finalize(E).root, fin.root)
  r.setPool(E, '50')
  assert.equal(BigInt(r.finalize(E).total) <= 50_000_000n, true)
  // not final yet: no tree
  now = (E + 1) * EPOCH + 10
  assert.equal(r.finalize(E + 0).pool, '50') // already stored stays
  db.close()
})

test('a zero pool scores but pays nobody; dust below 0.01 USDG is dropped', () => {
  const { db, all, offer, ev } = scratch()
  const E = 20_001, start = E * EPOCH
  const r = installRewards({ db, all, client: null, contract: null, chainNow: () => (E + 1) * EPOCH + 700 })
  offer('1', 'call', B, MEME, '1000000000000000', start + 5 * 86400); ev('e1', 'OptionBought', start + 100, { id: '1', buyer: A, premium: '1', fee: '1000000000000000' })
  offer('2', 'call', C, MEME, '1000000000000', start + 5 * 86400); ev('e2', 'OptionBought', start + 100, { id: '2', buyer: A, premium: '1', fee: '1000000000000' }) // 0.01 points
  let fin = r.finalize(E)
  assert.equal(fin.root, null); assert.equal(fin.total, '0'); assert.equal(fin.participants, 3)
  r.setPool(null, '1') // 1 USDG default pool: C's 0.01/20.02 share is ~0.0005 USDG -> dust
  fin = r.finalize(E)
  const leaves = all('SELECT account, amount FROM reward_leaves WHERE epoch = ?', E) as Array<{ account: string; amount: string }>
  assert.equal(leaves.find((l) => l.account === C)!.amount, '0')
  assert.ok(BigInt(leaves.find((l) => l.account === A)!.amount) > 0n)
  db.close()
})
