import React from 'react'
import { easeOut, spring01, FPS } from '../theme'

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Linear progress of `frame` through [start, start + dur]. */
export const prog = (frame: number, start: number, dur: number) => clamp01((frame - start) / Math.max(1, dur))
/** Eased (cubic-bezier(0.16,1,0.3,1)) progress. */
export const eprog = (frame: number, start: number, dur: number) => easeOut(prog(frame, start, dur))
/** Critically damped spring progress starting at `start` (frames). */
export const sprog = (frame: number, start: number, w = 14) => spring01((frame - start) / FPS, w)
/** Symmetric ease in-out (cubic). */
export const easeInOut = (t: number) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
export const easeIn = (t: number) => { const x = clamp01(t); return x * x * x }
/** Deterministic hash in [0,1) — use instead of Math.random. */
export const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s) }

export type Rect = { x: number; y: number; w: number; h: number }
export type Pt = { x: number; y: number }

export type Word = { text: string; grad?: boolean; italic?: boolean }

export const HERO_GRAD = 'linear-gradient(100deg, #7cff8e 0%, #5cffc4 45%, #4af0ff 100%)'
export const TEXT_GRAD = 'linear-gradient(100deg, #6eff85 0%, #4affec 100%)'

/**
 * Words rising through a mask line, one after another.
 * `start` = frame the first word starts; `stagger` frames between words; `dur` per word.
 * `exit` (optional) = frame the words start rising out (same stagger).
 */
export const WordRise: React.FC<{
  frame: number
  words: Word[]
  start: number
  stagger?: number
  dur?: number
  exit?: number
  exitDur?: number
  style?: React.CSSProperties
  gap?: string
}> = ({ frame, words, start, stagger = 3, dur = 48, exit, exitDur = 30, style, gap = '0.24em' }) => (
  <span style={{ display: 'inline-flex', flexWrap: 'nowrap', whiteSpace: 'nowrap', ...style }}>
    {words.map((w, i) => {
      const p = eprog(frame, start + i * stagger, dur)
      const q = exit === undefined ? 0 : easeInOut(prog(frame, exit + i * Math.max(1, stagger - 1), exitDur))
      const y = (1 - p) * 112 - q * 112
      return (
        <span key={i} style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: '0.14em', marginBottom: '-0.14em', paddingRight: w.italic ? '0.08em' : 0, marginRight: i < words.length - 1 ? gap : 0, verticalAlign: 'bottom' }}>
          <span
            style={{
              display: 'inline-block',
              transform: `translateY(${y}%)`,
              fontStyle: w.italic ? 'italic' : undefined,
              ...(w.grad ? { backgroundImage: HERO_GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', fontWeight: 400, paddingRight: '0.04em' } : null),
            }}
          >
            {w.text}
          </span>
        </span>
      )
    })}
  </span>
)

/** Parse "Your terms." style strings: words wrapped in *asterisks* get the hero gradient. */
export const words = (s: string): Word[] =>
  s.split(/\s+/).filter(Boolean).map((t) => (t.startsWith('*') || t.endsWith('*') ? { text: t.replace(/\*/g, ''), grad: true } : { text: t }))
