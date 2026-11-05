import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { C, H, W } from '../theme'
import { EYEBROW, F, NUM } from './fonts'
import { Icon, type IconName } from './icons'
import { clamp01, easeInOut, eprog, lerp, prog, sprog, type Pt, type Rect } from './motion'

const GLASS: React.CSSProperties = {
  background: 'rgba(24,24,24,.86)',
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 18px 50px rgba(0,0,0,.45)',
}

type Side = 'top' | 'bottom' | 'left' | 'right'

const edgePoint = (r: Rect, side: Side): Pt =>
  side === 'right' ? { x: r.x + r.w, y: r.y + r.h / 2 }
  : side === 'left' ? { x: r.x, y: r.y + r.h / 2 }
  : side === 'top' ? { x: r.x + r.w / 2, y: r.y }
  : { x: r.x + r.w / 2, y: r.y + r.h }

/** Shared enter/exit envelope for annotation pieces. */
const envelope = (frame: number, enter: number, exit?: number) => {
  const outT = exit === undefined ? 0 : easeInOut(prog(frame, exit, 16))
  return { outT, visible: frame >= enter && outT < 1 }
}

/**
 * Annotation pinned to a screen rect (1920x1080 coords): the rect outline (rounded `radius`) draws on,
 * a thin leader line draws from the rect to a glass label card, the card springs in. `exit` retracts it.
 * `side` = where the card sits relative to the rect (auto picks the side with the most room).
 */
export const Callout: React.FC<{
  rect: Rect
  label: string
  sub?: string
  eyebrow?: string
  icon?: IconName
  side?: Side
  distance?: number
  cardWidth?: number
  enter?: number
  exit?: number
  accent?: string
  radius?: number
  outline?: boolean
}> = ({ rect, label, sub, eyebrow, icon, side, distance = 72, cardWidth, enter = 0, exit, accent = C.mint, radius = 12, outline = true }) => {
  const frame = useCurrentFrame()
  const { outT, visible } = envelope(frame, enter, exit)
  if (!visible) return null

  const s: Side = side ?? (() => {
    const room = { right: W - (rect.x + rect.w), left: rect.x, top: rect.y, bottom: H - (rect.y + rect.h) }
    return (Object.entries(room).sort((a, b) => b[1] - a[1])[0][0]) as Side
  })()

  const estW = cardWidth ?? Math.max(label.length * 12.4, (sub ?? '').length * 10.4, (eyebrow ?? '').length * 9.5) + (icon ? 40 : 0) + 40
  const estH = 22 + 30 + (sub ? 26 : 0) + (eyebrow ? 24 : 0)

  const a = edgePoint(rect, s)
  const cardPos: Pt =
    s === 'right' ? { x: a.x + distance, y: a.y - estH / 2 }
    : s === 'left' ? { x: a.x - distance - estW, y: a.y - estH / 2 }
    : s === 'top' ? { x: a.x - estW / 2, y: a.y - distance - estH }
    : { x: a.x - estW / 2, y: a.y + distance }
  const cx = Math.min(W - estW - 40, Math.max(40, cardPos.x))
  const cy = Math.min(H - estH - 40, Math.max(40, cardPos.y))
  const b: Pt =
    s === 'right' ? { x: cx, y: cy + estH / 2 }
    : s === 'left' ? { x: cx + estW, y: cy + estH / 2 }
    : s === 'top' ? { x: cx + estW / 2, y: cy + estH }
    : { x: cx + estW / 2, y: cy }

  const ring = eprog(frame, enter, 30)
  const line = eprog(frame, enter + 12, 22) * (1 - outT)
  const card = sprog(frame, enter + 24, 22)
  const cardOut = outT
  const per = 2 * (rect.w + rect.h)
  const lx = lerp(a.x, b.x, line), ly = lerp(a.y, b.y, line)

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {outline && (
          <rect
            x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={radius}
            fill="none" stroke={accent} strokeWidth={2}
            strokeDasharray={`${per * ring} ${per}`}
            opacity={1 - outT}
          />
        )}
        {outline && <rect x={rect.x - 6} y={rect.y - 6} width={rect.w + 12} height={rect.h + 12} rx={radius + 6} fill="none" stroke={accent} strokeOpacity={0.16 * ring * (1 - outT)} strokeWidth={8} />}
        {line > 0.001 && (
          <>
            <line x1={a.x} y1={a.y} x2={lx} y2={ly} stroke={accent} strokeWidth={1.5} />
            <circle cx={a.x} cy={a.y} r={3.5} fill={accent} />
          </>
        )}
      </svg>
      {card > 0.001 && (
        <div
          style={{
            ...GLASS,
            position: 'absolute', left: cx, top: cy, width: estW,
            padding: '14px 20px',
            transformOrigin: s === 'right' ? '0% 50%' : s === 'left' ? '100% 50%' : s === 'top' ? '50% 100%' : '50% 0%',
            transform: `scale(${lerp(0.94, 1, card) * lerp(1, 0.96, cardOut)})`,
            opacity: clamp01(card * 1.6) * (1 - cardOut),
            display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          {icon && (
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(77,252,169,.10)', border: `1px solid rgba(77,252,169,.25)`, display: 'grid', placeItems: 'center' }}>
              <Icon name={icon} size={17} color={accent} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            {eyebrow && <div style={{ ...EYEBROW, fontSize: 12, color: C.muted }}>{eyebrow}</div>}
            <div style={{ fontFamily: F.body, fontWeight: 500, fontSize: 22, color: C.ink, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{label}</div>
            {sub && <div style={{ fontFamily: F.mono, ...NUM, fontSize: 16, color: accent, whiteSpace: 'nowrap' }}>{sub}</div>}
          </div>
        </div>
      )}
    </AbsoluteFill>
  )
}

export type Step = { label: string; icon: IconName }
export const KYTE_STEPS: Step[] = [
  { label: 'Lock', icon: 'lock' },
  { label: 'Fill', icon: 'fill' },
  { label: 'Settle', icon: 'settle' },
  { label: 'Split', icon: 'split' },
]

/**
 * "Lock · Fill · Settle · Split" step chips. Chip i appears at `at[i]` (frames) and is the active (mint) one
 * until the next appears. Row is centered on `center`. `exit` drops the whole row.
 */
export const StepChips: React.FC<{ at: number[]; center?: Pt; steps?: Step[]; exit?: number; accent?: string }> = ({
  at, center = { x: W / 2, y: H - 120 }, steps = KYTE_STEPS, exit, accent = C.mint,
}) => {
  const frame = useCurrentFrame()
  const { outT, visible } = envelope(frame, at[0] ?? 0, exit)
  if (!visible) return null
  const activeIdx = at.reduce((acc, f, i) => (frame >= f ? i : acc), -1)
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: center.x, top: center.y, transform: `translate(-50%, -50%) translateY(${outT * 24}px)`, opacity: 1 - outT, display: 'flex', alignItems: 'center', gap: 0 }}>
        {steps.map((st, i) => {
          const f0 = at[i] ?? Infinity
          const p = sprog(frame, f0, 20)
          const active = i === activeIdx
          const done = i < activeIdx
          const sep = i > 0 ? eprog(frame, f0 - 4, 14) : 0
          return (
            <React.Fragment key={st.label}>
              {i > 0 && (
                <div style={{ width: 44, height: 1.5, margin: '0 10px', background: `linear-gradient(90deg, ${C.border}, ${accent})`, transform: `scaleX(${sep})`, transformOrigin: '0 50%' }} />
              )}
              <div
                style={{
                  ...GLASS,
                  borderRadius: 999,
                  borderColor: active ? accent : C.border,
                  padding: '12px 22px 12px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  opacity: clamp01(p * 1.5),
                  transform: `translateY(${(1 - p) * 18}px) scale(${lerp(0.92, 1, p)})`,
                }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 30, display: 'grid', placeItems: 'center', background: active ? accent : 'rgba(255,255,255,.06)' }}>
                  <Icon name={st.icon} size={16} color={active ? '#000' : done ? accent : C.muted} stroke={2} />
                </div>
                <span style={{ fontFamily: F.mono, ...NUM, fontSize: 13, color: C.muted, letterSpacing: '0.08em' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: F.body, fontWeight: 500, fontSize: 21, color: active || done ? C.ink : C.muted }}>{st.label}</span>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

export type Flow = { from: Pt; to: Pt; label: string; icon?: IconName; color?: string; bend?: number }

const qPoint = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({
  x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
})

/**
 * Token-flow callout: curved arrows that draw from `from` to `to`, each carrying a token chip
 * (e.g. "NVDA → buyer", "ETH → seller"). Flow i starts at enter + i*stagger.
 */
export const TokenFlow: React.FC<{ flows: Flow[]; enter?: number; stagger?: number; exit?: number }> = ({ flows, enter = 0, stagger = 16, exit }) => {
  const frame = useCurrentFrame()
  const { outT, visible } = envelope(frame, enter, exit)
  if (!visible) return null
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: 1 - outT }}>
      {flows.map((fl, i) => {
        const col = fl.color ?? C.mint
        const st = enter + i * stagger
        const d = eprog(frame, st, 40)
        const travel = 0.5 * easeInOut(prog(frame, st + 4, 44))
        const dx = fl.to.x - fl.from.x, dy = fl.to.y - fl.from.y
        const len = Math.hypot(dx, dy) || 1
        const bend = fl.bend ?? 0.22
        const c: Pt = { x: (fl.from.x + fl.to.x) / 2 - (dy / len) * len * bend, y: (fl.from.y + fl.to.y) / 2 + (dx / len) * len * bend }
        // sample the drawn part
        const N = 48
        const pts: Pt[] = []
        for (let k = 0; k <= N; k++) pts.push(qPoint(fl.from, c, fl.to, (k / N) * d))
        const dPath = pts.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
        const tip = pts[pts.length - 1]
        const prev = qPoint(fl.from, c, fl.to, Math.max(0, d - 0.02))
        const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x)
        const chip = qPoint(fl.from, c, fl.to, travel)
        const chipP = sprog(frame, st + 4, 24)
        return (
          <React.Fragment key={i}>
            <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
              <path d={dPath} fill="none" stroke={col} strokeOpacity={0.2} strokeWidth={8} strokeLinecap="round" />
              <path d={dPath} fill="none" stroke={col} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 0" />
              {d > 0.02 && (
                <path
                  d="M-12 -7 L0 0 L-12 7"
                  transform={`translate(${tip.x} ${tip.y}) rotate(${(ang * 180) / Math.PI})`}
                  fill="none" stroke={col} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
                />
              )}
              <circle cx={fl.from.x} cy={fl.from.y} r={4} fill={col} opacity={d > 0 ? 1 : 0} />
            </svg>
            {chipP > 0.001 && (
              <div
                style={{
                  ...GLASS,
                  position: 'absolute', left: chip.x, top: chip.y,
                  transform: `translate(-50%, -50%) scale(${lerp(0.8, 1, chipP)})`,
                  opacity: clamp01(chipP * 1.6),
                  borderRadius: 999, borderColor: col,
                  padding: '9px 18px 9px 10px', display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap',
                }}
              >
                <div style={{ width: 26, height: 26, borderRadius: 26, background: col, display: 'grid', placeItems: 'center' }}>
                  <Icon name={fl.icon ?? 'coin'} size={15} color="#000" stroke={2.2} />
                </div>
                <span style={{ fontFamily: F.mono, ...NUM, fontSize: 18, color: C.ink, letterSpacing: '0.02em' }}>{fl.label}</span>
              </div>
            )}
          </React.Fragment>
        )
      })}
    </AbsoluteFill>
  )
}
