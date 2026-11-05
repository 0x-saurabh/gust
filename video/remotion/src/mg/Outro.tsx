import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { C, H, W } from '../theme'
import { EYEBROW, F } from './fonts'
import { KYTE_ASPECT, KyteWordmark } from './KyteWordmark'
import { KyteTile } from './KyteTile'
import { clamp01, easeInOut, eprog, lerp, prog } from './motion'
import { irisRadius } from './transitions/Iris'

export const OUTRO_FRAMES = 420
/** Frame marks. Everything is perfectly still from OUTRO_T.still (last 2 s). */
export const OUTRO_T = { iris: 84, markIn: 46, release: 104, url: 168, live: 180, still: 300 }

const TILE = 240
const WM_END = 560

/**
 * Outro (7.0 s). `children` = the last frame of the recording (full-frame element). An iris (eased by area)
 * closes on the centre while the Kyte mark irises open inside it; the iris morphs into the rounded Kyte tile;
 * the tile then closes around its own wordmark, which grows into the final lockup with "kyte.sh" and the mono
 * eyebrow "Live on Robinhood Chain". Frames ≥ 300 are identical (final 2 s hold).
 */
export const Outro: React.FC<{ children?: React.ReactNode; url?: string; eyebrow?: string }> = ({ children, url = 'kyte.sh', eyebrow = 'Live on Robinhood Chain' }) => {
  const frame = useCurrentFrame()
  const f = Math.min(frame, OUTRO_T.still)
  const cx = W / 2
  const cy = H / 2 - 40

  // 1. iris closes (area-eased) and morphs circle -> rounded tile
  const S0 = 2 * Math.hypot(W / 2, H / 2 + 40) * 1.04
  const ti = easeInOut(prog(f, 0, OUTRO_T.iris))
  const sIris = 2 * irisRadius(ti, S0 / 2, TILE / 2)
  const morph = easeInOut(clamp01((620 - sIris) / (620 - TILE)))

  // 2. the tile closes around its wordmark (area-eased), the wordmark grows into the lockup
  const rel = easeInOut(prog(f, OUTRO_T.release, 60))
  const size = 2 * irisRadius(rel, sIris / 2, 0)
  const rad = lerp(size / 2, size * 0.235, morph)

  // inner iris: the mark opens inside the closing iris
  const innerR = irisRadius(easeInOut(prog(f, OUTRO_T.markIn, 32)), 0, sIris * 0.75)

  const wmGrow = eprog(f, OUTRO_T.release, 70)
  const wmW = lerp(sIris * 0.48, WM_END, wmGrow)
  const wmOn = innerR > sIris * 0.3

  const urlP = eprog(f, OUTRO_T.url, 48)
  const liveP = eprog(f, OUTRO_T.live, 48)
  const glow = eprog(f, OUTRO_T.release, 90)

  const clip = `inset(${cy - size / 2}px ${W - (cx + size / 2)}px ${H - (cy + size / 2)}px ${cx - size / 2}px round ${rad}px)`

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 42% 34% at 50% ${((cy + 60) / H) * 100}%, rgba(77,252,169,${0.075 * glow}), rgba(0,0,0,0) 70%)` }} />
      {size > 0.5 && (
        <AbsoluteFill style={{ clipPath: clip }}>
          <AbsoluteFill style={{ background: '#050807' }}>{children}</AbsoluteFill>
          {innerR > 0 && (
            <div style={{ position: 'absolute', left: cx - sIris / 2, top: cy - sIris / 2, width: sIris, height: sIris, clipPath: `circle(${innerR}px at 50% 50%)` }}>
              <KyteTile size={sIris} wordmark={false} />
            </div>
          )}
          {morph > 0.99 && <div style={{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size, borderRadius: rad, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.10)' }} />}
        </AbsoluteFill>
      )}

      {/* the wordmark: inside the tile at first (clipped by the inner iris), then free and growing */}
      {wmOn && (
        <div
          style={{
            position: 'absolute', left: cx - wmW / 2 + wmW * 0.0, top: cy - (wmW * KYTE_ASPECT) / 2,
            clipPath: f < OUTRO_T.release ? `circle(${innerR}px at ${wmW / 2}px ${(wmW * KYTE_ASPECT) / 2}px)` : undefined,
          }}
        >
          <KyteWordmark id="outro-wm" width={wmW} strokeOpacity={0} />
        </div>
      )}

      <div style={{ position: 'absolute', left: 0, right: 0, top: cy + (WM_END * KYTE_ASPECT) / 2 + 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <div style={{ overflow: 'hidden', paddingBottom: 6 }}>
          <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 46, letterSpacing: '-0.01em', color: C.ink, transform: `translateY(${(1 - urlP) * 112}%)` }}>{url}</div>
        </div>
        <div style={{ overflow: 'hidden', paddingBottom: 2 }}>
          <div style={{ ...EYEBROW, fontSize: 16, color: C.muted, display: 'flex', alignItems: 'center', gap: 12, transform: `translateY(${(1 - liveP) * 112}%)` }}>
            <span style={{ width: 7, height: 7, borderRadius: 7, background: C.mint, boxShadow: `0 0 10px ${C.mint}` }} />
            {eyebrow}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
