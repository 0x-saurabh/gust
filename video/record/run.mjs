// Record the film's screen scenes in order, with the chain prep each needs, and print per-scene stats.
//
//   node video/record/run.mjs                      # landing how stock sell buy settle stake
//   node video/record/run.mjs stock sell           # just these (order is always the storyboard order)
//
// Chain state flows between scenes: sell lists an offer, buy fills the seeded buy-scene offer (minting the NFT),
// settle exercises that option, stake needs real fees + a split. So:
//   sell   ← reset.mjs first (cancels persona leftovers, re-funds, re-seeds missing film offers)
//   buy    ← reset.mjs first (re-seeds buy-scene if a previous take bought it)
//   settle ← prep.mjs settle (clean Holding tab + a real WETH payout); needs this run's (or the last) buy
//   stake  ← prep.mjs stake (fee volume, pre-stake, epoch advance, split, buyback). Advances chain time ~1 day,
//            so run it last; offers' countdowns shift by that much afterwards.
// Outputs: video/recordings/<scene>/{frames/,events.json,meta.json}. Also video/remotion/public/nft/option.svg (buy).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, OUT_ROOT } from './lib.mjs'
import { prepSettle, prepStake } from './prep.mjs'

const ORDER = ['landing', 'how', 'stock', 'sell', 'buy', 'settle', 'stake']
const want = process.argv.slice(2)
const bad = want.filter((s) => !ORDER.includes(s))
if (bad.length) { console.error(`unknown scene(s): ${bad.join(', ')}; known: ${ORDER.join(' ')}`); process.exit(1) }
const scenes = want.length ? ORDER.filter((s) => want.includes(s)) : ORDER
const reset = () => execFileSync('node', [path.join(ROOT, 'video/env/reset.mjs')], { stdio: 'inherit' })

const stats = []
for (const id of scenes) {
  console.log(`\n=== ${id} ===`)
  if (id === 'sell' || id === 'buy') reset()
  if (id === 'settle') await prepSettle()
  if (id === 'stake') await prepStake()
  const t = Date.now()
  const mod = await import(`./scenes/${id}.mjs`)
  const r = await mod.default()
  console.log(r.summary.join('\n'))
  stats.push({ id, frames: r.meta.frames, seconds: r.meta.durationS, srcFps: r.meta.source.fps, motionFps: r.meta.source.motionFps, maxGapMs: r.meta.source.gapMs.max, wall: Math.round((Date.now() - t) / 1000) })
}
const du = (d) => { let n = 0; const seen = new Set(); for (const f of fs.readdirSync(d, { recursive: true })) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isFile() && !seen.has(st.ino)) { seen.add(st.ino); n += st.size } } return n }
console.log('\nscene     frames   secs  srcFps motionFps maxGap(ms)')
for (const s of stats) console.log(`${s.id.padEnd(9)} ${String(s.frames).padStart(6)} ${String(s.seconds).padStart(6)} ${String(s.srcFps).padStart(7)} ${String(s.motionFps ?? '-').padStart(9)} ${String(s.maxGapMs).padStart(10)}`)
console.log(`recordings on disk (hard links counted once): ${(du(OUT_ROOT) / 1e9).toFixed(2)} GB`)
