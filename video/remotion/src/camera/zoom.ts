// Screen-Studio-style auto camera. Everything here is a pure function of the recording frame.
//
// Model: the camera is (z, cx, cy): zoom and the page point at the frame centre. A list of "shots"
// (target rect + zoom, start..end) becomes a list of keyframes on (log z, ux, uy), where ux/uy are the
// camera centre as a fraction of the pan slack at that zoom (0 = left/top edge of the page, 1 = right/bottom).
// Each keyframe step is eased by a critically damped spring, and steps are summed. Because a critically
// damped step is monotone, the sum is a convex blend of the targets, so ux/uy stay in [0,1] and the camera
// can never show outside the page, at any zoom, on any frame.
import { FPS, H, W, spring01 } from '../theme'
import type { Recording, RecEvent, Rect } from './useRecording'

export type ShotSource = 'click' | 'hover' | 'focus' | 'type' | 'manual'
export type Shot = {
  start: number; end: number; rect: Rect; zoom: number; source: ShotSource; label?: string
  /** set when the cursor left the framing and the next shot follows within mergeGap: travel through a framing of both */
  travel?: boolean
}

export type CameraOpts = {
  /** Fit the target rect to this fraction of the frame width (default 0.45). */
  fitFrac: number
  /** Auto-zoom cap (default 2.2). focus.zoom and overrides may go up to hardMax. */
  maxZoom: number
  hardMax: number
  /** Spring stiffness (critically damped), rad/s. */
  w: number
  /** Start moving this many frames before a click so the zoom lands with it. */
  anticipate: number
  /** Return to 1.0 after this many frames without activity. */
  idle: number
  /** Gaps shorter than this are bridged (never zoom out and back in within 0.5 s). */
  mergeGap: number
  /** Hover events need at least this dwell to become a shot. */
  minDwell: number
  /** Which events make shots. */
  use: { click: boolean; hover: boolean; focus: boolean; type: boolean }
  /** A scroll releases the current shot (the page moves under the camera). */
  scrollReleases: boolean
  /** Slow push-in on long holds: max extra zoom (0.03..0.07). 0 disables. */
  drift: number
  /** Per-label tweaks: number = zoom for that shot, null = ignore events with that label. */
  byLabel: Record<string, number | null>
  /** Extra hand-placed shots (recording frames). */
  extra: Shot[]
  /** End a shot early when the cursor comes within -exitMargin px of the framing edge (or past it if positive). null disables. */
  exitMargin: number | null
}

export const DEFAULT_CAMERA: CameraOpts = {
  fitFrac: 0.45, maxZoom: 2.2, hardMax: 2.5, w: 14, anticipate: 20, idle: 120, mergeGap: 30, minDwell: 30,
  use: { click: true, hover: true, focus: true, type: true }, scrollReleases: true, drift: 0.05, byLabel: {}, extra: [], exitMargin: -60,
}

export type CameraOverrides = Partial<Omit<CameraOpts, 'use'>> & { use?: Partial<CameraOpts['use']> }
export const cameraOpts = (o: CameraOverrides = {}): CameraOpts => ({ ...DEFAULT_CAMERA, ...o, use: { ...DEFAULT_CAMERA.use, ...o.use } })

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const boxAround = (x: number, y: number): Rect => ({ x: x - 180, y: y - 100, w: 360, h: 200 })
const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

/** Zoom that fits rect to fitFrac of the frame width (and ~65% of its height), clamped to [1, maxZoom]. */
export const fitZoom = (r: Rect, o: CameraOpts) =>
  clamp(Math.min((o.fitFrac * W) / Math.max(1, r.w), (0.65 * H) / Math.max(1, r.h)), 1, o.maxZoom)

/** Turn the recording's events into camera shots. */
/** Page-px rectangle the camera shows when framing rect at zoom z (clamped to the page). */
export const viewOf = (r: Rect, z: number): Rect => {
  const vw = W / z, vh = H / z
  const x = clamp(r.x + r.w / 2 - vw / 2, 0, W - vw), y = clamp(r.y + r.h / 2 - vh / 2, 0, H - vh)
  return { x, y, w: vw, h: vh }
}

export const planShots = (
  events: RecEvent[], frames: number, o: CameraOpts, cursorAt?: (f: number) => { x: number; y: number },
): Shot[] => {
  type Cand = Shot & { act: number; explicit: boolean }
  const cands: Cand[] = []
  const ignored = (label?: string) => label !== undefined && o.byLabel[label] === null
  const zoomFor = (r: Rect, label?: string, z?: number) => {
    const l = label !== undefined ? o.byLabel[label] : undefined
    if (typeof l === 'number') return clamp(l, 1, o.hardMax)
    if (z !== undefined) return clamp(z, 1, o.hardMax)
    return fitZoom(r, o)
  }
  for (const e of events) {
    if (e.type === 'click' && o.use.click && !ignored(e.label)) {
      const rect = e.rect ?? boxAround(e.x, e.y)
      cands.push({ start: e.f - o.anticipate, end: 0, act: e.f, rect, zoom: zoomFor(rect, e.label), source: 'click', label: e.label, explicit: false })
    } else if (e.type === 'hover' && o.use.hover && (e.dwell ?? 0) >= o.minDwell && !ignored(e.label)) {
      const rect = e.rect ?? boxAround(e.x, e.y)
      cands.push({ start: e.f - Math.round(o.anticipate / 2), end: 0, act: e.f + (e.dwell ?? 0), rect, zoom: zoomFor(rect, e.label), source: 'hover', label: e.label, explicit: false })
    } else if (e.type === 'focus' && o.use.focus && !ignored(e.label)) {
      cands.push({ start: e.f, end: 0, act: e.f + (e.hold ?? 60), rect: e.rect, zoom: zoomFor(e.rect, e.label, e.zoom), source: 'focus', label: e.label, explicit: e.zoom !== undefined })
    } else if (e.type === 'type' && o.use.type && e.rect && !ignored(e.label)) {
      const n = e.charFrames?.length ? e.charFrames[e.charFrames.length - 1] - e.f : e.text.length * 5
      cands.push({ start: e.f - 4, end: 0, act: e.f + n, rect: e.rect, zoom: zoomFor(e.rect, e.label), source: 'type', label: e.label, explicit: false })
    }
  }
  for (const s of o.extra) cands.push({ ...s, act: s.end, explicit: true })
  cands.sort((a, b) => a.start - b.start)

  // merge targets that start within mergeGap of each other into one framing
  const merged: Cand[] = []
  for (const c of cands) {
    const p = merged[merged.length - 1]
    if (p && c.start - p.start < o.mergeGap && c.source !== 'manual' && p.source !== 'manual') {
      p.rect = union(p.rect, c.rect)
      p.zoom = p.explicit ? p.zoom : c.explicit ? c.zoom : Math.min(p.zoom, fitZoom(p.rect, o))
      p.explicit = p.explicit || c.explicit
      p.act = Math.max(p.act, c.act)
      if (c.source === 'click') p.source = 'click'
    } else merged.push({ ...c })
  }

  // activity (any non-cursor event) keeps a shot alive; idle ends it; scroll releases it; next shot cuts it
  const activity = events.filter((e) => e.type !== 'cursor' && e.type !== 'scroll').map((e) => e.f)
  const scrolls = events.filter((e) => e.type === 'scroll').map((e) => e.f)
  const out: Shot[] = []
  for (let i = 0; i < merged.length; i++) {
    const c = merged[i], next = merged[i + 1]
    let end = c.source === 'manual' ? c.end : c.act + o.idle
    if (c.source !== 'manual') {
      for (const a of activity) if (a > c.act && a <= end) end = a + o.idle
      if (o.scrollReleases) {
        const s = scrolls.find((s) => s > c.act - 1 && s < end)
        if (s !== undefined) end = s
      }
      if (c.source === 'focus') end = Math.max(end, c.act) // a focus always gets its hold
    }
    if (next && next.start < end) end = next.start
    // the cursor walked out of the framing: let go a few frames later
    let exited = false
    if (cursorAt && o.exitMargin !== null && c.source !== 'focus' && c.source !== 'manual') {
      const v = viewOf(c.rect, c.zoom), m = o.exitMargin
      for (let f = Math.max(c.start, Math.min(c.act, end)); f < end; f++) {
        const p = cursorAt(f)
        if (p.x < v.x - m || p.x > v.x + v.w + m || p.y < v.y - m || p.y > v.y + v.h + m) {
          if (f + 4 < end) { end = Math.max(c.start + o.mergeGap, f + 4); exited = true }
          break
        }
      }
    }
    const travel = exited && !!next && next.start - end < o.mergeGap
    if (next && !exited && next.start - end < o.mergeGap) end = next.start
    end = Math.min(end, frames + o.idle)
    if (end - c.start < o.mergeGap && c.source !== 'focus' && c.source !== 'manual') continue // too short to be worth it
    out.push({ start: c.start, end, rect: c.rect, zoom: c.zoom, source: c.source, label: c.label, travel })
  }
  return out
}

type Key = { t: number; lz: number; ux: number; uy: number }
export type CameraPlan = { shots: Shot[]; keys: Key[]; o: CameraOpts }

const slackU = (center: number, z: number, size: number) => {
  const slack = size - size / z
  return slack < 1e-6 ? 0.5 : clamp((center - size / (2 * z)) / slack, 0, 1)
}

export const planCamera = (rec: Pick<Recording, 'events' | 'frames'> & Partial<Pick<Recording, 'cursorAt'>>, overrides: CameraOverrides = {}): CameraPlan => {
  const o = cameraOpts(overrides)
  const shots = planShots(rec.events, rec.frames, o, rec.cursorAt)
  const keys: Key[] = []
  let ux = 0.5, uy = 0.5
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i]
    ux = slackU(s.rect.x + s.rect.w / 2, s.zoom, W)
    uy = slackU(s.rect.y + s.rect.h / 2, s.zoom, H)
    keys.push({ t: s.start, lz: Math.log(s.zoom), ux, uy })
    const next = shots[i + 1]
    if (next && s.travel && next.start > s.end) {
      // travel between two shots: pull back to a framing that holds both (often 1.0), then land on the next
      const u = union(s.rect, next.rect), z = fitZoom(u, o)
      keys.push({ t: s.end, lz: Math.log(z), ux: slackU(u.x + u.w / 2, z, W), uy: slackU(u.y + u.h / 2, z, H) })
    } else if (!next || next.start > s.end) keys.push({ t: s.end, lz: 0, ux, uy }) // out to 1.0, keep framing so it un-zooms in place
  }
  return { shots, keys, o }
}

export type Cam = { z: number; cx: number; cy: number }

/** The camera at recording frame f (fractional ok). extraZoom multiplies (intro framing, < 1 shows the screen edge). */
export const cameraAt = (plan: CameraPlan, f: number, extraZoom = 1): Cam => {
  const { keys, shots, o } = plan
  let lz = 0, ux = 0.5, uy = 0.5, plz = 0, pux = 0.5, puy = 0.5
  for (const k of keys) {
    const s = spring01((f - k.t) / FPS, o.w)
    if (s <= 0) break
    lz += (k.lz - plz) * s; ux += (k.ux - pux) * s; uy += (k.uy - puy) * s
    plz = k.lz; pux = k.ux; puy = k.uy
  }
  // slow drift on long holds: ease in over the hold, spring back out after
  if (o.drift > 0)
    for (const s of shots) {
      const len = s.end - s.start
      if (len < 90 || s.zoom < 1.05 || f < s.start) continue
      // drift 0.05 -> 1.03x on a 1.5 s hold up to 1.07x on 6 s+
      const amt = Math.log(1 + o.drift * clamp(0.6 + (len - 90) / 340, 0.6, 1.4))
      const a = s.start + 10
      const p = clamp((Math.min(f, s.end) - a) / (s.end - a), 0, 1)
      const smooth = p * p * (3 - 2 * p)
      const fall = f > s.end ? 1 - spring01((f - s.end) / FPS, o.w) : 1
      lz += amt * smooth * fall
    }
  const z = Math.exp(lz) * extraZoom
  if (z <= 1) return { z, cx: W / 2, cy: H / 2 }
  return { z, cx: W / (2 * z) + ux * (W - W / z), cy: H / (2 * z) + uy * (H - H / z) }
}

/** Page px -> screen px. */
export const toScreen = (c: Cam, p: { x: number; y: number }) => ({ x: (p.x - c.cx) * c.z + W / 2, y: (p.y - c.cy) * c.z + H / 2 })
/** CSS transform for a page-sized container with transform-origin 0 0. */
export const camTransform = (c: Cam) => `translate(${W / 2 - c.cx * c.z}px, ${H / 2 - c.cy * c.z}px) scale(${c.z})`
