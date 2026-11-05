// Shared recording helpers for the Kyte film (see video/SPEC.md "Recording capture" and "events.json").
//
//   const s = await openScene({ persona: 'seller', connected: false })      // browser + context + page (shim, no cursor)
//   await s.goto('/sell')                                                    // load + wait for network, fonts, images
//   const rec = await s.record('sell')                                       // start CDP screencast + event clock
//   await rec.click(locator, 'label') / rec.hover(...) / rec.type(...) / rec.scroll(...) / rec.focus(...) / rec.mark(...)
//   await rec.stop()                                                         // resample to 60 fps, write frames/, events.json, meta.json
//   await s.close()
//
// One clock: CDP frame metadata.timestamp and event times are both wall-clock seconds. Event `f` = round((t - t0) * 60)
// where t0 is the first output slot. Cursor events are evaluated from the same analytic path the real mouse follows.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(HERE, '../..')
export const JOB = process.env.CLAUDE_JOB_DIR || '/Users/apple/.claude/jobs/9eeca95c'
export const DEMO_DIR = process.env.DEMO_DIR || path.join(JOB, 'tmp/demo')
export const SITE = process.env.SITE_URL || 'http://localhost:3011'
export const RPC = process.env.RPC_URL || 'http://127.0.0.1:8549'
export const INDEXER = process.env.INDEXER_URL || 'http://127.0.0.1:4299'
export const OUT_ROOT = path.join(ROOT, 'video/recordings')
const PW_DIR = process.env.PLAYWRIGHT_DIR || path.join(JOB, 'tmp/captest/node_modules/playwright')
const CHROME = process.env.CHROME_PATH || '/Users/apple/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const { chromium } = createRequire(import.meta.url)(PW_DIR)
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(RPC)) throw new Error(`refusing non-local RPC ${RPC}`)

const FPS = 60
const VW = 1920, VH = 1080, DPR = 1.5
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => Date.now() / 1000
const rand = (a, b) => a + Math.random() * (b - a)
const r1 = (v) => Math.round(v * 10) / 10
const rect = (b) => b && { x: r1(b.x), y: r1(b.y), w: r1(b.width ?? b.w), h: r1(b.height ?? b.h) }

const HIDE_CURSOR = `(() => {
  const css = '*, *::before, *::after { cursor: none !important; } ::-webkit-scrollbar { display: none; } html { scrollbar-width: none; }'
  const add = () => { if (document.getElementById('__nocursor')) return; const s = document.createElement('style'); s.id = '__nocursor'; s.textContent = css; (document.head || document.documentElement).appendChild(s) }
  if (document.documentElement) add(); document.addEventListener('DOMContentLoaded', add)
})()`

// ---------------------------------------------------------------- browser / page
export async function openScene({ persona = 'seller', connected = false, log = true } = {}) {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--force-device-scale-factor=1.5', '--hide-scrollbars'] })
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR })
  await ctx.addInitScript(`window.__DEMO_WALLET_CONFIG = { rpc: ${JSON.stringify(RPC)}, persona: ${JSON.stringify(persona)}, connected: ${!!connected} }`)
  await ctx.addInitScript({ path: path.join(HERE, 'wallet-shim.js') })
  await ctx.addInitScript(HIDE_CURSOR)
  const page = await ctx.newPage()
  const problems = []
  page.on('pageerror', (e) => { problems.push(`pageerror: ${e.message}`); if (log) console.log('[page error]', e.message.slice(0, 200)) })
  page.on('console', (m) => { if (m.type() === 'error') { problems.push(`console: ${m.text().slice(0, 200)}`); if (log) console.log('[console]', m.text().slice(0, 160)) } })
  const s = {
    browser, ctx, page, problems,
    mouse: { x: VW / 2, y: VH / 2 },
    async goto(url, { settle = 800 } = {}) {
      await page.goto(url.startsWith('http') ? url : SITE + url, { waitUntil: 'load' })
      await waitReady(page)
      await sleep(settle)
    },
    record: (scene, opts) => startRecording(s, scene, opts),
    close: () => browser.close(),
    async failShot(tag = 'fail') { const f = path.join(JOB, 'tmp/rec', `${tag}-${Date.now()}.png`); fs.mkdirSync(path.dirname(f), { recursive: true }); await page.screenshot({ path: f }).catch(() => {}); console.log('[fail screenshot]', f) },
  }
  await page.mouse.move(s.mouse.x, s.mouse.y)
  return s
}

/** Network idle (best effort: the site polls), fonts, and every <img> decoded (token logos come from 3rd-party CDNs). */
export async function waitReady(page, timeout = 15_000) {
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {})
  await page.evaluate(async (ms) => {
    const until = Date.now() + ms
    await document.fonts.ready
    while (Date.now() < until) {
      const imgs = [...document.images].filter((i) => i.loading !== 'lazy' || i.getBoundingClientRect().top < innerHeight)
      if (imgs.every((i) => i.complete)) break
      await new Promise((r) => setTimeout(r, 100))
    }
    await Promise.all([...document.images].filter((i) => i.complete && i.naturalWidth).map((i) => i.decode().catch(() => {})))
  }, timeout).catch(() => {})
}

export async function connectWallet(page) {
  await page.getByRole('button', { name: /0x[0-9a-f]{4}.*[0-9a-f]{4}/i }).first().waitFor({ timeout: 15_000 })
}

// ---------------------------------------------------------------- easing / paths
// cubic-bezier(x1,y1,x2,y2) solver (CSS timing function).
function bezierEase(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const sx = (t) => ((ax * t + bx) * t + cx) * t
  const sy = (t) => ((ay * t + by) * t + cy) * t
  const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dsx(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d }
    t = Math.min(1, Math.max(0, t))
    return sy(t)
  }
}
const MOVE_EASE = bezierEase(0.42, 0, 0.18, 1) // gentle start, long soft landing: reads as a hand, not a robot

/** Quadratic-ish arc: cubic bezier with both control points pushed sideways by `bend` (fraction of distance). */
function makePath(from, to, bend) {
  const dx = to.x - from.x, dy = to.y - from.y
  const nx = -dy, ny = dx // perpendicular (length = distance)
  const c1 = { x: from.x + dx * 0.3 + nx * bend, y: from.y + dy * 0.3 + ny * bend }
  const c2 = { x: from.x + dx * 0.75 + nx * bend * 0.6, y: from.y + dy * 0.75 + ny * bend * 0.6 }
  return (u) => {
    const v = 1 - u
    return {
      x: v * v * v * from.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * to.x,
      y: v * v * v * from.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * to.y,
    }
  }
}

// ---------------------------------------------------------------- recording
export async function startRecording(s, scene, { quality = 90 } = {}) {
  const { page } = s
  const dir = path.join(OUT_ROOT, scene)
  fs.rmSync(dir, { recursive: true, force: true })
  const srcDir = path.join(dir, '_src')
  fs.mkdirSync(srcDir, { recursive: true })
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true })

  const cdp = await page.context().newCDPSession(page)
  const frames = [] // { ts, file, recv }
  const writes = []
  let stopped = false
  cdp.on('Page.screencastFrame', (f) => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    if (stopped) return
    const file = path.join(srcDir, `${String(frames.length).padStart(6, '0')}.jpg`)
    frames.push({ ts: f.metadata.timestamp, recv: now(), file })
    writes.push(fs.promises.writeFile(file, Buffer.from(f.data, 'base64')))
  })
  const events = [] // raw: { t, ...event }
  const moves = [] // { t0, t1, path } analytic cursor segments
  const jitters = [] // { t, x, y }
  const t0 = now()
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: VW * DPR, maxHeight: VH * DPR, everyNthFrame: 1 })
  // Keep-alive: a 1 px, near-invisible element repainted every animation frame, so the compositor emits a frame every
  // vsync even on a static page (otherwise /positions-style pages drop to ~20 fps of source frames). Survives
  // client-side navigation; re-armed on full loads by the 'load' listener below.
  const keepAlive = () => page.evaluate(() => {
    if (window.__kyteKeepAlive) return
    const d = document.createElement('div'); d.id = '__keepalive'
    d.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;pointer-events:none;z-index:2147483647;background:#000'
    document.body.appendChild(d)
    let i = 0; const tick = () => { d.style.opacity = (i++ % 2) ? '0.011' : '0.012'; window.__kyteKeepAlive = requestAnimationFrame(tick) }; tick()
  }).catch(() => {})
  await keepAlive()
  const onLoad = () => keepAlive()
  page.on('load', onLoad)

  const ev = (e) => { const o = { t: now(), ...e }; events.push(o); return o }
  const box = async (loc) => { await loc.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {}); const b = await loc.boundingBox({ timeout: 10_000 }); if (!b) throw new Error('element has no box'); return b }

  async function moveTo(x, y, { duration } = {}) {
    const from = { ...s.mouse }, to = { x, y }
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    if (dist < 2) { await page.mouse.move(x, y); s.mouse = to; return }
    const dur = duration ?? Math.min(0.9, 0.4 + 0.5 * Math.min(1, dist / 1100)) * rand(0.95, 1.05)
    const bend = rand(0.05, 0.12) * (Math.random() < 0.5 ? -1 : 1)
    const p = makePath(from, to, bend)
    const seg = { t0: now(), t1: 0, dur, path: (u) => p(MOVE_EASE(u)) }
    moves.push(seg)
    for (;;) {
      const u = Math.min(1, (now() - seg.t0) / dur)
      const q = seg.path(u)
      await page.mouse.move(q.x, q.y)
      if (u >= 1) break
      await sleep(8)
    }
    seg.t1 = seg.t0 + dur
    s.mouse = to
  }
  /** A point inside the element, slightly off-center like a real pointer. */
  const aim = (b, ax = 0.5, ay = 0.5) => ({ x: b.x + b.width * ax + rand(-0.06, 0.06) * Math.min(b.width, 120), y: b.y + b.height * ay + rand(-0.12, 0.12) * Math.min(b.height, 30) })
  async function dwell(ms) {
    const until = now() + ms / 1000
    const n = Math.max(1, Math.round(ms / 350))
    for (let i = 0; i < n && now() < until; i++) {
      await sleep(Math.min(ms / n, (until - now()) * 1000))
      const j = { t: now(), x: s.mouse.x + rand(-0.8, 0.8), y: s.mouse.y + rand(-0.6, 0.6) }
      jitters.push(j)
    }
    const rest = (until - now()) * 1000
    if (rest > 0) await sleep(rest)
  }

  const rec = {
    scene, page, dir,
    t: () => now() - t0,
    frameNow: () => Math.round((now() - t0) * FPS),
    moveTo,
    async moveToEl(loc, { ax = 0.5, ay = 0.5 } = {}) { const b = await box(loc); const p = aim(b, ax, ay); await moveTo(p.x, p.y); return b },
    async hover(loc, dwellMs = 700, label = '', opts = {}) {
      const b = await box(loc)
      const p = aim(b, opts.ax ?? 0.5, opts.ay ?? 0.5)
      await moveTo(p.x, p.y)
      const e = ev({ type: 'hover', x: r1(p.x), y: r1(p.y), rect: rect(b), label, dwellMs })
      await dwell(dwellMs)
      return { rect: rect(b), event: e }
    },
    async click(loc, label = '', opts = {}) {
      const b = await box(loc)
      const p = aim(b, opts.ax ?? 0.5, opts.ay ?? 0.5)
      await moveTo(p.x, p.y)
      await sleep(rand(110, 180))
      ev({ type: 'click', x: r1(p.x), y: r1(p.y), rect: rect(b), label })
      await page.mouse.down()
      await sleep(rand(60, 95))
      await page.mouse.up()
      return rect(b)
    },
    /** Types into the (already focused, or clicked-first) field with a 70–140 ms rhythm; one `type` event per key. */
    async type(loc, text, { clickFirst = true, label = '', replace = false } = {}) {
      const b = await box(loc)
      if (clickFirst) await rec.click(loc, label || 'field')
      if (replace) { await page.keyboard.press('ControlOrMeta+a'); await sleep(rand(90, 140)) }
      await sleep(rand(180, 260))
      for (const ch of text) {
        ev({ type: 'type', text: ch, rect: rect(b), label })
        await page.keyboard.type(ch)
        await sleep(rand(70, 140) + (ch === ' ' ? 40 : 0))
      }
      return rect(b)
    },
    /** Smooth wheel scroll in small steps (Lenis smooths further). Positive dy scrolls down. */
    async scroll(dy, { step = 40, interval = 22, settle = 600 } = {}) {
      const n = Math.max(1, Math.round(Math.abs(dy) / step))
      const per = dy / n
      const startY = await page.evaluate(() => scrollY)
      for (let i = 0; i < n; i++) {
        // ease the step size so the burst starts and ends softly
        const k = Math.sin(Math.PI * (i + 0.5) / n) * Math.PI / 2
        const d = per * k
        ev({ type: 'scroll', dy: r1(d) })
        await page.mouse.wheel(0, d)
        await sleep(interval)
      }
      await sleep(settle)
      const endY = await page.evaluate(() => scrollY)
      ev({ type: 'mark', name: 'scrolled', data: { from: Math.round(startY), to: Math.round(endY) } })
      return endY
    },
    focus(r, { zoom, hold = 90, label = '' } = {}) { const e = { type: 'focus', rect: rect(r), label, hold }; if (zoom) e.zoom = zoom; return ev(e) },
    mark(name, data) { return ev({ type: 'mark', name, ...(data !== undefined ? { data } : {}) }) },
    dwell,
    sleep,
    /** Waits for the bottom-right TxStatus card with `labelRe` to say Confirmed; logs `tx` + returns its rect. Fails on "Failed". */
    async waitConfirmed(labelRe, { timeout = 60_000, label, focusZoom } = {}) {
      const card = page.locator('div.card.fixed').filter({ hasText: labelRe })
      const until = Date.now() + timeout
      const states = []
      for (;;) {
        const txt = await card.first().innerText({ timeout: 500 }).catch(() => '')
        const st = /Confirmed/.test(txt) ? 'confirmed' : /Failed/.test(txt) ? 'failed' : /Confirm in your wallet/.test(txt) ? 'signing' : /Waiting/.test(txt) ? 'pending' : /Checking/.test(txt) ? 'simulating' : ''
        if (st && st !== states.at(-1)) { states.push(st); if (st !== 'confirmed') ev({ type: 'tx', state: st, label: label || txt.split('\n')[0] }) }
        if (st === 'failed') throw new Error(`tx failed: ${txt}`)
        if (st === 'confirmed') break
        if (Date.now() > until) throw new Error(`timeout waiting for Confirmed (${labelRe}); last: ${txt}`)
        await sleep(30)
      }
      const b = rect(await card.first().boundingBox())
      ev({ type: 'tx', state: 'confirmed', label: label || String(labelRe), rect: b })
      if (focusZoom) rec.focus(b, { zoom: focusZoom, hold: 100, label: 'TxStatus toast' })
      return b
    },
    async stop({ tail = 0 } = {}) {
      if (tail) await sleep(tail)
      const tEnd = now()
      stopped = true
      page.off('load', onLoad)
      await page.evaluate(() => { cancelAnimationFrame(window.__kyteKeepAlive); window.__kyteKeepAlive = 0; document.getElementById('__keepalive')?.remove() }).catch(() => {})
      await cdp.send('Page.stopScreencast').catch(() => {})
      await Promise.all(writes)
      await cdp.detach().catch(() => {})
      return finalize({ scene, dir, srcDir, frames, events, moves, jitters, t0, tEnd })
    },
  }
  ev({ type: 'cursor', x: r1(s.mouse.x), y: r1(s.mouse.y) })
  return rec
}

function finalize({ scene, dir, srcDir, frames, events, moves, jitters, t0, tEnd }) {
  if (!frames.length) throw new Error('no frames captured')
  frames.sort((a, b) => a.ts - b.ts)
  // Calibrate the frame clock against the event clock: CDP timestamps are the compositor's wall time; the
  // receive time adds IPC latency. Use the minimum (recv - ts) as the offset estimate (the frame clock is usually
  // within a few ms of Date.now()).
  const lat = Math.min(...frames.map((f) => f.recv - f.ts))
  const offset = Math.abs(lat) < 0.5 ? 0 : lat // only correct gross clock mismatch
  const nSlots = Math.floor((tEnd - t0) * FPS)
  const out = path.join(dir, 'frames')
  let j = 0, dup = 0, used = new Set()
  for (let k = 0; k < nSlots; k++) {
    const ts = t0 + k / FPS - offset
    while (j + 1 < frames.length && frames[j + 1].ts <= ts) j++
    const src = frames[j].file
    const dst = path.join(out, `${String(k).padStart(6, '0')}.jpg`)
    if (used.has(j)) dup++
    used.add(j)
    try { fs.linkSync(src, dst) } catch { fs.copyFileSync(src, dst) }
  }
  fs.rmSync(srcDir, { recursive: true, force: true })

  // Source fps stats over the recorded window.
  const inWin = frames.filter((f) => f.ts >= t0 - offset && f.ts <= tEnd - offset)
  const gaps = inWin.slice(1).map((f, i) => (f.ts - inWin[i].ts) * 1000)
  const sorted = [...gaps].sort((a, b) => a - b)
  const pct = (p) => sorted.length ? r1(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]) : 0
  // fps while the cursor was moving (the content is guaranteed to be changing then: hover states, the camera follows)
  let motionFrames = 0, motionDur = 0
  for (const m of moves) { motionDur += m.dur; motionFrames += inWin.filter((f) => f.ts + offset >= m.t0 && f.ts + offset <= m.t0 + m.dur).length }
  const worst = gaps.length ? Math.max(...gaps) : 0
  const worstAt = gaps.length ? Math.round((inWin[gaps.indexOf(worst)].ts + offset - t0) * FPS) : 0
  const meta = {
    scene, fps: FPS, frames: nSlots, durationS: Math.round((tEnd - t0) * 1000) / 1000,
    source: {
      frames: inWin.length, fps: r1(inWin.length / (tEnd - t0)), motionFps: motionDur ? r1(motionFrames / motionDur) : null,
      gapMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: r1(worst), maxAtFrame: worstAt }, gapsOver50ms: gaps.filter((g) => g > 50).length,
      clockOffsetS: r1(offset * 1000) / 1000, latencyMs: r1(lat * 1000),
    },
    uniqueSlots: nSlots - dup, duplicatedSlots: dup,
    jpeg: { quality: 90, width: VW * DPR, height: VH * DPR },
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')

  // events.json: frame indices on the 60 fps grid; cursor sampled every slot while moving.
  const F = (t) => Math.max(0, Math.min(nSlots - 1, Math.round((t - t0) * FPS)))
  const out_ev = []
  for (const e of events) { const { t, dwellMs, ...rest } = e; const o = { f: F(t), ...rest }; if (dwellMs) o.dwell = Math.round(dwellMs / 1000 * FPS); out_ev.push(o) }
  for (const m of moves) {
    const fa = Math.ceil((m.t0 - t0) * FPS), fb = Math.floor((m.t0 + m.dur - t0) * FPS)
    for (let f = fa; f <= fb + 1; f++) {
      if (f < 0 || f >= nSlots) continue
      const u = Math.min(1, Math.max(0, (t0 + f / FPS - m.t0) / m.dur))
      const q = m.path(u)
      out_ev.push({ f, type: 'cursor', x: r1(q.x), y: r1(q.y) })
    }
  }
  for (const jt of jitters) out_ev.push({ f: F(jt.t), type: 'cursor', x: r1(jt.x), y: r1(jt.y) })
  // one cursor event per frame at most (the last wins), stable order: cursor first within a frame
  const seen = new Map()
  const rest = []
  for (const e of out_ev) { if (e.type === 'cursor') seen.set(e.f, e); else rest.push(e) }
  const all = [...seen.values(), ...rest].sort((a, b) => a.f - b.f || (a.type === 'cursor' ? -1 : b.type === 'cursor' ? 1 : 0))
  const doc = { scene, fps: FPS, frames: nSlots, viewport: { w: VW, h: VH, dpr: DPR }, events: all }
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(doc, null, 1) + '\n')
  const summary = all.filter((e) => e.type !== 'cursor' && e.type !== 'scroll' && e.type !== 'type').map((e) => `${e.f}:${e.type}${e.state ? '/' + e.state : ''}${e.name ? '/' + e.name : ''}${e.label ? ' ' + e.label : ''}`)
  console.log(`[${scene}] ${nSlots} frames (${meta.durationS}s), source ${meta.source.fps} fps (motion ${meta.source.motionFps}), gap p95 ${meta.source.gapMs.p95} ms max ${meta.source.gapMs.max} ms @f${worstAt}`)
  return { meta, events: doc, summary }
}

// ---------------------------------------------------------------- chain helpers (local fork only)
export async function rpc(method, params = []) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const b = await r.json()
  if (b.error) throw new Error(`${method}: ${b.error.message}`)
  return b.result
}
export const getJson = async (p) => (await fetch(INDEXER + p)).json()
export const deployments = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts/deployments/4663.json'), 'utf8'))
export const seeded = () => JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'seeded.json'), 'utf8'))
export const PERSONA = { seller: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', buyer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }
