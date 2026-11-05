import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { C } from '../theme'
import { EYEBROW, F } from './fonts'
import { eprog, prog, WordRise, words } from './motion'

/**
 * Eyebrow (Geist Mono, uppercase) + headline that rises word by word through a mask.
 * `title`: wrap words in *asterisks* for the hero gradient, e.g. "Sell a *covered call*".
 * `enter`/`exit` are frames in the parent timeline. `variant` 'center' (full-frame title card over `backdrop`)
 * or 'lower' (lower third, bottom-left, with a soft scrim for legibility over recordings).
 */
export const KineticTitle: React.FC<{
  eyebrow?: string
  title: string
  enter?: number
  exit?: number
  variant?: 'center' | 'lower'
  size?: number
  backdrop?: string
}> = ({ eyebrow, title, enter = 0, exit, variant = 'lower', size, backdrop }) => {
  const frame = useCurrentFrame()
  const center = variant === 'center'
  const fs = size ?? (center ? 112 : 64)
  const tw = words(title)
  const eyebrowIn = eprog(frame, enter, 36)
  const exitStart = exit ?? Infinity
  const eyebrowOut = exit === undefined ? 0 : prog(frame, exit, 20)
  const scrim = variant === 'lower' ? eprog(frame, enter - 6, 30) * (1 - (exit === undefined ? 0 : prog(frame, exit + 6, 24))) : 0
  const titleStart = enter + (eyebrow ? 6 : 0)
  return (
    <AbsoluteFill style={{ background: center ? backdrop : undefined, pointerEvents: 'none' }}>
      {variant === 'lower' && (
        <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.72) 100%)', opacity: scrim }} />
      )}
      <div
        style={{
          position: 'absolute',
          ...(center ? { left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' } : { left: 120, bottom: 110, alignItems: 'flex-start' }),
          display: 'flex',
          flexDirection: 'column',
          gap: center ? 28 : 18,
        }}
      >
        {eyebrow && (
          <div style={{ overflow: 'hidden', paddingBottom: 2 }}>
            <div
              style={{
                ...EYEBROW,
                display: 'flex', alignItems: 'center', gap: 12,
                fontSize: center ? 18 : 16, color: C.muted,
                transform: `translateY(${(1 - eyebrowIn) * 110 - eyebrowOut * 110}%)`,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 7, background: C.mint }} />
              {eyebrow}
            </div>
          </div>
        )}
        <WordRise
          frame={frame}
          words={tw}
          start={titleStart}
          stagger={3}
          dur={48}
          exit={exitStart === Infinity ? undefined : exitStart}
          style={{ fontFamily: F.hero, fontWeight: 300, fontSize: fs, lineHeight: 1.02, letterSpacing: '-0.04em', color: '#f2f7f4' }}
        />
      </div>
    </AbsoluteFill>
  )
}
