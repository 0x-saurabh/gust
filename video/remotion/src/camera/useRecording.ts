import { useEffect, useMemo, useState } from 'react'
import { continueRender, delayRender, staticFile } from 'remotion'
import { H, W } from '../theme'

/** One entry of a recording's events.json (see video/SPEC.md). Coordinates are 1920x1080 CSS px. */
export type Rect = { x: number; y: number; w: number; h: number }
export type RecEvent =
  | { f: number; type: 'cursor'; x: number; y: number }
  | { f: number; type: 'hover'; x: number; y: number; rect?: Rect; label?: string; dwell?: number }
  | { f: number; type: 'click'; x: number; y: number; rect?: Rect; label?: string }
  | { f: number; type: 'type'; text: string; rect?: Rect; label?: string; charFrames?: number[] }
  | { f: number; type: 'scroll'; dy: number }
  | { f: number; type: 'focus'; rect: Rect; label?: string; zoom?: number; hold?: number }
  | { f: number; type: 'tx'; state: string; label?: string }
  | { f: number; type: 'mark'; name: string; data?: Record<string, unknown> }

export type EventsFile = {
  scene: string
  fps: number
  frames: number
  viewport: { w: number; h: number; dpr: number }
  events: RecEvent[]
}

export type Recording = {
  id: string
  data: EventsFile
  /** Number of frames in the recording (events.frames; the last one is held past the end). */
  frames: number
  events: RecEvent[]
  /** Smoothed cursor position at a (possibly fractional) recording frame, in page px. */
  cursorAt: (f: number) => { x: number; y: number }
  /** The hover event the cursor is resting on at frame f, if any. */
  hoverAt: (f: number) => Extract<RecEvent, { type: 'hover' }> | null
  clicks: number[]
}

const SMOOTH_SIGMA = 2.2 // frames; zero-phase Gaussian, so no lag (clicks land exactly where recorded)

/** Pure: build the per-frame lookup tables for a recording. */
export const buildRecording = (id: string, data: EventsFile): Recording => {
  const N = Math.max(1, data.frames)
  const events = [...data.events].sort((a, b) => a.f - b.f)
  // raw per-frame cursor path: hold the last known point between samples, so gaps mean "mouse still".
  const pts = events.filter((e): e is Extract<RecEvent, { x: number }> => 'x' in e && typeof e.x === 'number')
  const rx = new Float64Array(N), ry = new Float64Array(N)
  let cx = pts[0]?.x ?? W / 2, cy = pts[0]?.y ?? H / 2, j = 0
  for (let f = 0; f < N; f++) {
    while (j < pts.length && pts[j].f <= f) { cx = pts[j].x; cy = pts[j].y; j++ }
    rx[f] = cx; ry[f] = cy
  }
  // pinned frames (click / hover) must not be moved by the filter
  const pinned = new Set(events.filter((e) => e.type === 'click').map((e) => e.f))
  const R = Math.ceil(SMOOTH_SIGMA * 3)
  const k = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / (2 * SMOOTH_SIGMA ** 2)))
  const sx = new Float64Array(N), sy = new Float64Array(N)
  for (let f = 0; f < N; f++) {
    let ax = 0, ay = 0, aw = 0
    for (let i = -R; i <= R; i++) {
      const g = Math.min(N - 1, Math.max(0, f + i)), w = k[i + R]
      ax += rx[g] * w; ay += ry[g] * w; aw += w
    }
    sx[f] = ax / aw; sy[f] = ay / aw
  }
  // blend back to the raw point around clicks (±3 f) so the arrow tip sits exactly on the click
  for (const c of pinned) for (let i = -3; i <= 3; i++) {
    const f = c + i
    if (f < 0 || f >= N) continue
    const t = 1 - Math.abs(i) / 4
    sx[f] += (rx[c] - sx[f]) * t; sy[f] += (ry[c] - sy[f]) * t
  }
  const cursorAt = (f: number) => {
    const a = Math.min(N - 1, Math.max(0, Math.floor(f))), b = Math.min(N - 1, a + 1), t = Math.min(1, Math.max(0, f - a))
    return { x: sx[a] + (sx[b] - sx[a]) * t, y: sy[a] + (sy[b] - sy[a]) * t }
  }
  const hovers = events.filter((e): e is Extract<RecEvent, { type: 'hover' }> => e.type === 'hover')
  const hoverAt = (f: number) => {
    for (let i = hovers.length - 1; i >= 0; i--) {
      const h = hovers[i]
      if (f >= h.f && f <= h.f + (h.dwell ?? 30)) return h
    }
    return null
  }
  return { id, data, frames: N, events, cursorAt, hoverAt, clicks: events.filter((e) => e.type === 'click').map((e) => e.f) }
}

export const framePath = (id: string, n: number) => staticFile(`recordings/${id}/frames/${String(n).padStart(6, '0')}.jpg`)
const exists = (url: string) => fetch(url, { method: 'HEAD' }).then((r) => r.ok).catch(() => false)

const cache = new Map<string, Promise<EventsFile | null>>()
/**
 * Reads events.json, then binary-searches the frames folder for the last frame that exists, and caps
 * `frames` to it, so a capture that came out short holds its last frame instead of failing the render.
 */
const load = (id: string) => {
  if (!cache.has(id))
    cache.set(id, (async () => {
      const r = await fetch(staticFile(`recordings/${id}/events.json`)).catch(() => null)
      if (!r || !r.ok) return null
      const data = (await r.json()) as EventsFile
      let hi = Math.max(1, data.frames) - 1
      if (!(await exists(framePath(id, hi)))) {
        let lo = 0
        if (!(await exists(framePath(id, 0)))) return null
        while (lo < hi - 1) { const m = (lo + hi) >> 1; if (await exists(framePath(id, m))) lo = m; else hi = m }
        data.frames = lo + 1
      }
      return data
    })())
  return cache.get(id)!
}

/**
 * Loads recordings/<id>/events.json. Returns undefined while loading, null if the scene has no recording,
 * else the Recording. Holds the render (delayRender) until the file has been read.
 */
export const useRecording = (id: string): Recording | null | undefined => {
  const [state, setState] = useState<{ id: string; data: EventsFile | null } | undefined>(undefined)
  const [handle] = useState(() => delayRender(`events.json for ${id}`))
  useEffect(() => {
    let live = true
    load(id).then((data) => {
      if (live) setState({ id, data })
      continueRender(handle)
    })
    return () => { live = false; continueRender(handle) }
  }, [id, handle])
  return useMemo(() => (state === undefined ? undefined : state.data ? buildRecording(state.id, state.data) : null), [state])
}

/** Probe several recording ids at once (for fallbacks): resolves to the set that exist. */
export const useAvailableRecordings = (ids: string[]): Set<string> | undefined => {
  const key = ids.join(',')
  const [got, setGot] = useState<Set<string> | undefined>(undefined)
  const [handle] = useState(() => delayRender(`probe recordings ${key}`))
  useEffect(() => {
    Promise.all(ids.map((id) => load(id).then((d) => (d ? id : null)))).then((r) => {
      setGot(new Set(r.filter((x): x is string => !!x)))
      continueRender(handle)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, handle])
  return got
}
