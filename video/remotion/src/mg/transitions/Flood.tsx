import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { C, H, W } from '../../theme'
import { easeInOut, prog, type Pt } from '../motion'

/** Radius that covers the whole frame from `o`, overscaled by `over`. */
export const coverRadius = (o: Pt, over = 1.12) => over * Math.max(Math.hypot(o.x, o.y), Math.hypot(W - o.x, o.y), Math.hypot(o.x, H - o.y), Math.hypot(W - o.x, H - o.y))

/**
 * Color flood (~0.3 s = 18 frames). mode 'in': a disc of `color` grows from `origin` until it covers the frame
 * (overscaled past the corners). mode 'out': the frame starts covered and a hole grows from `origin`, revealing
 * what is underneath. Area-eased so the coverage feels linear. Render it above the layers it covers.
 * `start`/`dur` are frames in the parent sequence's timeline.
 */
export const Flood: React.FC<{ start: number; dur?: number; color?: string; origin?: Pt; mode?: 'in' | 'out' }> = ({
  start, dur = 18, color = C.mint, origin = { x: W / 2, y: H / 2 }, mode = 'in',
}) => {
  const frame = useCurrentFrame()
  const t = easeInOut(prog(frame, start, dur))
  const R = coverRadius(origin)
  const r = R * Math.sqrt(t)
  if (mode === 'in') {
    if (t <= 0) return null
    return <AbsoluteFill style={{ background: color, clipPath: `circle(${r.toFixed(1)}px at ${origin.x}px ${origin.y}px)` }} />
  }
  if (t >= 1) return null
  const d = `M-10 -10 H${W + 10} V${H + 10} H-10 Z M${origin.x - r} ${origin.y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`
  return <AbsoluteFill style={{ background: color, clipPath: `path(evenodd, '${d}')` }} />
}
