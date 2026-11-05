import React from 'react'
import { C, easeOut } from '../theme'
import type { Recording } from './useRecording'
import { toScreen, type Cam } from './zoom'

// macOS-like arrow, drawn in a 20x26 box; hotspot at (2, 1.5).
const ARROW = 'M2 1.5 L2 20.6 L6.55 16.35 L9.55 23.3 L12.85 21.9 L9.95 15.1 L16.1 15.1 Z'
const HX = 2, HY = 1.5, BW = 20, BH = 26

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export type CursorProps = {
  rec: Recording
  /** recording frame (fractional ok) */
  f: number
  cam: Cam
  /** on-screen size relative to a native 1x cursor (default 1.7); constant regardless of zoom */
  size?: number
  /** fade the cursor (e.g. 0 during MG overlays) */
  opacity?: number
}

/** Cursor drawn in screen space from page coordinates, so it stays crisp and constant-size at any zoom. */
export const Cursor: React.FC<CursorProps> = ({ rec, f, cam, size = 1.7, opacity = 1 }) => {
  const p = toScreen(cam, rec.cursorAt(f))
  // click: press-scale down to 0.85 over 4 f, back over 9 f; ripple over 21 f (0.35 s)
  let press = 1
  const ripples: { x: number; y: number; t: number }[] = []
  for (const c of rec.clicks) {
    const d = f - c
    if (d >= -4 && d < 0) press = Math.min(press, 1 - 0.15 * easeOut((d + 4) / 4))
    else if (d >= 0 && d < 9) press = Math.min(press, 0.85 + 0.15 * easeOut(d / 9))
    if (d >= 0 && d < 21) ripples.push({ ...toScreen(cam, rec.cursorAt(c)), t: d / 21 })
  }
  // hover glow: fades in over 8 f once the cursor rests on a hover target
  let glow = 0
  for (const e of rec.events)
    if (e.type === 'hover' && f >= e.f && f < e.f + (e.dwell ?? 30) + 8)
      glow = Math.max(glow, clamp01((f - e.f) / 8) * clamp01((e.f + (e.dwell ?? 30) + 8 - f) / 8))
  const s = size
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity }}>
      {ripples.map((r, i) => {
        const e = easeOut(r.t)
        const rad = 10 + 38 * e
        return (
          <div key={i} style={{
            position: 'absolute', left: r.x - rad, top: r.y - rad, width: rad * 2, height: rad * 2, borderRadius: '50%',
            border: `${3 - 1.6 * e}px solid ${C.mint}`, background: `rgba(77,252,169,${0.2 * (1 - e)})`,
            opacity: 0.95 * (1 - r.t) ** 1.4, boxSizing: 'border-box',
          }} />
        )
      })}
      <svg
        width={BW * s} height={BH * s} viewBox={`0 0 ${BW} ${BH}`}
        style={{
          position: 'absolute', left: p.x - HX * s, top: p.y - HY * s, overflow: 'visible',
          transform: `scale(${press})`, transformOrigin: `${HX * s}px ${HY * s}px`,
          filter: `drop-shadow(0 ${1.6 * s}px ${2.2 * s}px rgba(0,0,0,0.5))${glow > 0 ? ` drop-shadow(0 0 ${6 * s}px rgba(77,252,169,${0.55 * glow}))` : ''}`,
        }}
      >
        <path d={ARROW} fill="#fff" stroke="#0b0b0b" strokeWidth={1.25} strokeLinejoin="round" />
      </svg>
    </div>
  )
}
