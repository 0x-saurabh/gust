import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { H, W } from '../../theme'
import { easeInOut, lerp, prog, type Pt } from '../motion'
import { coverRadius } from './Flood'

/** Iris radius eased by area: area goes linearly-in-ease from r0² to r1². */
export const irisRadius = (t: number, r0: number, r1: number) => Math.sqrt(Math.max(0, lerp(r0 * r0, r1 * r1, t)))

/**
 * Iris mask over `children`. mode 'open': children appear through a circle growing from `toRadius` (default 0)
 * to cover the frame. mode 'close': children are visible full-frame and the circle shrinks to `toRadius`.
 * Outside the circle shows `outside` (default transparent, so lower layers show through).
 */
export const Iris: React.FC<{
  start: number
  dur?: number
  origin?: Pt
  mode?: 'open' | 'close'
  toRadius?: number
  outside?: string
  children: React.ReactNode
}> = ({ start, dur = 30, origin = { x: W / 2, y: H / 2 }, mode = 'open', toRadius = 0, outside, children }) => {
  const frame = useCurrentFrame()
  const t = easeInOut(prog(frame, start, dur))
  const R = coverRadius(origin, 1.05)
  const r = mode === 'open' ? irisRadius(t, toRadius, R) : irisRadius(t, R, toRadius)
  return (
    <AbsoluteFill style={{ background: outside }}>
      <AbsoluteFill style={{ clipPath: `circle(${r.toFixed(1)}px at ${origin.x}px ${origin.y}px)` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  )
}
