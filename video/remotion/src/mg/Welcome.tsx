import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { C, FPS, H, W } from '../theme'
import { Aurora } from './Aurora'
import { F } from './fonts'
import { KYTE_ASPECT, KyteWordmark } from './KyteWordmark'
import { easeInOut, eprog, lerp, prog, WordRise, words } from './motion'
import { cumLengths, pointAt, polyD, priceCurve } from './priceLine'

export const WELCOME_FRAMES = 420
export const WELCOME_EXIT_START = 384

const CURVE = priceCurve({ x0: -40, x1: W + 40, base: 800, amp: 30, rise: 130, knots: 12, seed: 11 })
const CURVE_L = cumLengths(CURVE)
const CURVE_MAX_Y = Math.max(...CURVE.map((p) => p.y))
const LIFT = CURVE_MAX_Y + 140 // overscaled past the top edge

const SWEEP_START = 214
const SWEEP_DUR = 120

/** Vertical lift of the price line during the exit (0 before exitStart, ~LIFT at the end). */
export const welcomeExitLift = (frame: number, exitStart = WELCOME_EXIT_START, exitDur = WELCOME_FRAMES - WELCOME_EXIT_START) =>
  LIFT * easeInOut(prog(frame, exitStart, exitDur))

/**
 * CSS clip-path for the region under the rising price line. Apply it to the next scene's layer
 * (stacked above Welcome) to match-cut through the line. Returns 'inset(100%)' (nothing) before the exit.
 */
export const welcomeExitClipPath = (frame: number, exitStart = WELCOME_EXIT_START, exitDur = WELCOME_FRAMES - WELCOME_EXIT_START) => {
  const lift = welcomeExitLift(frame, exitStart, exitDur)
  if (lift <= 0.5) return 'inset(100% 0 0 0)'
  return `path('${polyD(CURVE, -lift)} L${W + 60} ${H + 60} L-60 ${H + 60} Z')`
}

/**
 * Welcome (7.0 s = 420 frames). Aurora bloom → Kyte wordmark draws on → "Options, on Your terms." rises →
 * mint price line sweeps → from `exitStart` the line rises and the area under it reveals `next`
 * (or floods mint if `next` is not given).
 */
export const Welcome: React.FC<{
  exitStart?: number
  next?: React.ReactNode
  floodColor?: string
  italic?: boolean
}> = ({ exitStart = WELCOME_EXIT_START, next, floodColor = C.mint, italic = false }) => {
  const frame = useCurrentFrame()
  const t = frame / FPS
  const exitDur = WELCOME_FRAMES - exitStart

  // camera push (whole scene, slow and constant)
  const push = lerp(1.0, 1.05, frame / WELCOME_FRAMES)

  // aurora bloom in the first 1.5 s
  const bloom = easeInOut(prog(frame, 0, 100))

  // mark: draw on, fill, then rise to the top as the type enters
  const draw = eprog(frame, 20, 92)
  const fill = easeInOut(prog(frame, 92, 46))
  const strokeOp = 1 - prog(frame, 150, 30) * 0.85
  const lift = eprog(frame, 150, 56)
  const markW = lerp(640, 330, lift)
  const markY = lerp(H / 2 - 18, 318, lift)

  // price line sweep
  const sweep = eprog(frame, SWEEP_START, SWEEP_DUR)
  const exitLift = welcomeExitLift(frame, exitStart, exitDur)
  const head = pointAt(CURVE, CURVE_L, sweep)
  const drawn = [...CURVE.slice(0, head.i), head.p]
  const headOn = sweep > 0 && sweep < 1 ? 1 : 0
  const exiting = exitLift > 0.5

  const titleWords = words(`Options, on *Your* *terms.*`).map((w) => ({ ...w, italic: italic && !!w.grad }))

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '50% 48%' }}>
        <Aurora t={t} bloom={bloom} dim={0.55} />

        {/* mark */}
        <div style={{ position: 'absolute', left: W / 2 - markW / 2, top: markY - (markW * KYTE_ASPECT) / 2 }}>
          <KyteWordmark id="welcome-mark" width={markW} draw={draw} fill={fill} strokeWidthPx={lerp(1.8, 1.2, lift)} strokeOpacity={strokeOp} />
        </div>

        {/* headline */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 470, display: 'flex', justifyContent: 'center' }}>
          <WordRise
            frame={frame}
            words={titleWords}
            start={176}
            stagger={4}
            dur={50}
            style={{ fontFamily: F.hero, fontWeight: 300, fontSize: 132, lineHeight: 1, letterSpacing: '-0.045em', color: '#f2f7f4' }}
          />
        </div>

      </AbsoluteFill>

      {/* price line */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <linearGradient id="wl-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={C.mint} stopOpacity="0.16" />
            <stop offset="1" stopColor={C.mint} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wl-fade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={C.mint} stopOpacity="0" />
            <stop offset="0.12" stopColor={C.mint} stopOpacity="1" />
            <stop offset="1" stopColor={C.mint} stopOpacity="1" />
          </linearGradient>
        </defs>
        {sweep > 0 && !exiting && (
          <>
            <path d={`${polyD(drawn)} L${head.p.x} ${H} L-40 ${H} Z`} fill="url(#wl-area)" />
            <path d={polyD(drawn)} fill="none" stroke={C.mint} strokeOpacity={0.18} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
            <path d={polyD(drawn)} fill="none" stroke="url(#wl-fade)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {headOn > 0 && (
              <>
                <circle cx={head.p.x} cy={head.p.y} r={16} fill={C.mint} opacity={0.18} />
                <circle cx={head.p.x} cy={head.p.y} r={5} fill={C.mint} />
              </>
            )}
          </>
        )}
      </svg>

      {/* exit: the area under the rising line becomes the window into the next scene */}
      {exiting && (
        <>
          <AbsoluteFill style={{ clipPath: welcomeExitClipPath(frame, exitStart, exitDur), background: next ? '#000' : floodColor }}>
            {next}
          </AbsoluteFill>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <path d={polyD(CURVE, -exitLift)} fill="none" stroke={C.mint} strokeOpacity={0.25} strokeWidth={10} strokeLinejoin="round" />
            <path d={polyD(CURVE, -exitLift)} fill="none" stroke={C.mint} strokeWidth={3} strokeLinejoin="round" />
          </svg>
        </>
      )}
    </AbsoluteFill>
  )
}
