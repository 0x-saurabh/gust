// Synthetic sample recording for the compositor: video/recordings/_sample/{frames/*.jpg, events.json, meta.json}.
// Screenshots https://kyte.sh/market at 1920x1080 @dpr1.5 (2880x1620 JPEG q80 at the default DPR 1.5) only when the page changes;
// every other frame is a hard link to the previous shot, so 6 s @60 costs ~45 real files on disk.
//
//   node scripts/make-sample.mjs            (needs playwright; set PW_DIR to a folder with node_modules/playwright,
//                                            CHROME to a chromium/headless_shell binary if the bundled one is missing)
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(here, '../../recordings/_sample')
const URL = process.env.URL || 'https://kyte.sh/market'
const FPS = 60, N = 360, DPR = Number(process.env.DPR || 1.5)

let chromium
try { ({ chromium } = await import('playwright')) } catch {
  const req = createRequire(path.join(process.env.PW_DIR || '/tmp/kyte-pw', 'x.js'))
  ;({ chromium } = req('playwright'))
}
const defaultShell = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium_headless_shell-1194/chrome-mac/headless_shell')
const executablePath = process.env.CHROME || (fs.existsSync(defaultShell) ? defaultShell : undefined)

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true })
const framePath = (f) => path.join(OUT, 'frames', String(f).padStart(6, '0') + '.jpg')

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DPR })
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
await page.addStyleTag({ content: '*{cursor:none!important} html{scroll-behavior:auto!important}' })
await page.waitForTimeout(2500)

const rectOf = async (sel) => {
  const r = await page.locator(sel).first().boundingBox()
  return r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
}
const center = (r) => ({ x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) })

const picker = await rectOf('button:has-text("NVIDIA")')
const tabs = await rectOf('button:has-text("5m")')
const tabsGroup = tabs && { x: tabs.x - 52, y: tabs.y - 6, w: 190, h: tabs.h + 12 }
const calls = await rectOf('button:has-text("Calls")')

// ---- choreography (frames) ----
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const path2 = [] // [f0, f1, from, to]
const start = { x: 1180, y: 640 }
const pTabs = { x: tabs.x + tabs.w / 2 - 2, y: tabs.y + tabs.h / 2 + 2 }
const pPick = { x: picker.x + 60, y: picker.y + picker.h / 2 + 1 }
const pCalls = center(calls)
path2.push([8, 58, start, pTabs])        // to the timeframe tabs, hover dwell 58..104
path2.push([104, 144, pTabs, pPick])     // to the picker, click 150
path2.push([232, 250, pPick, { x: 900, y: 520 }])
path2.push([292, 316, { x: 900, y: 520 }, { x: 980, y: 560 }])
const cursorAt = (f) => {
  let p = start, moving = false
  for (const [a, b, from, to] of path2) {
    if (f >= b) p = to
    else if (f >= a) { moving = true; const t = ease((f - a) / (b - a)); p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * -40 } }
  }
  // small human jitter so the smoothing filter has something to do
  const j = moving ? 1.5 : 0
  return { x: Math.round(p.x + Math.sin(f * 1.7) * j), y: Math.round(p.y + Math.cos(f * 2.3) * j) }
}

const events = []
const snaps = new Map() // frame -> async action before screenshot
const at = (f, fn) => snaps.set(f, fn)
at(0, async () => {})
at(58, async () => page.mouse.move(pTabs.x, pTabs.y))
at(104, async () => page.mouse.move(pPick.x, pPick.y))
at(150, async () => { await page.mouse.click(pPick.x, pPick.y); await page.waitForTimeout(500) })
let typeRect = null
at(186, async () => { await page.keyboard.type('N'); await page.waitForTimeout(400) })
at(196, async () => { await page.keyboard.type('V'); await page.waitForTimeout(600) })
at(240, async () => { await page.keyboard.press('Escape'); await page.mouse.move(900, 520); await page.waitForTimeout(400) })
const S0 = 254, S1 = 294, DY = 420
for (let f = S0; f <= S1; f++) at(f, async () => { const t = ease((f - S0) / (S1 - S0)); await page.evaluate((y) => window.scrollTo(0, y), Math.round(DY * t)) })

let last = null
for (let f = 0; f < N; f++) {
  const c = cursorAt(f)
  const prev = f ? cursorAt(f - 1) : null
  if (!prev || prev.x !== c.x || prev.y !== c.y) events.push({ f, type: 'cursor', x: c.x, y: c.y })
  if (snaps.has(f)) {
    await snaps.get(f)()
    if (f === 150) {
      // after opening the picker the search input has focus
      typeRect = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })
    }
    await page.screenshot({ path: framePath(f), type: 'jpeg', quality: 80 })
    last = framePath(f)
    process.stdout.write('.')
  } else fs.linkSync(last, framePath(f))
}

// the offers card: smallest box whose text has both the FILL BY and SELLER headers
const offers = (await page.evaluate(() => {
  let best = null
  for (const e of document.querySelectorAll('div, section, table')) {
    const t = (e.innerText || '').toUpperCase(); if (!t.includes('FILL BY') || !t.includes('SELLER')) continue
    const r = e.getBoundingClientRect(); const a = r.width * r.height
    if (r.width > 600 && (!best || a < best.a)) best = { a, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  return best && { x: best.x, y: best.y, w: best.w, h: best.h }
})) || { x: 408, y: 733 - DY, w: 1104, h: 190 }
events.push(
  { f: 58, type: 'hover', ...pTabs, rect: tabsGroup, label: 'Timeframe tabs', dwell: 46 },
  { f: 150, type: 'click', ...pPick, rect: picker, label: 'Token picker' },
  { f: 186, type: 'type', text: 'NV', rect: typeRect || picker },
  { f: S0, type: 'scroll', dy: DY },
  { f: 300, type: 'focus', rect: offers, label: 'Offers table', zoom: 1.6, hold: 50 },
  { f: 330, type: 'tx', state: 'confirmed', label: 'Sample tx' },
)
events.sort((a, b) => a.f - b.f)
fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify({ scene: '_sample', fps: FPS, frames: N, viewport: { w: 1920, h: 1080, dpr: DPR }, events }, null, 1))
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ source: URL, generated: new Date().toISOString(), fps: FPS, frames: N, synthetic: true }, null, 1))
await browser.close()
console.log(`\nwrote ${N} frames + events.json to ${OUT}`)
