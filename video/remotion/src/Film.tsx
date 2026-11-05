// The full ~90 s film. Timeline per video/SPEC.md (scene lengths in src/theme.ts SCENES).
//
//   welcome (MG) ─match cut through the rising price line─▶ landing ─flood─▶ how ─flood─▶ stock ─flood─▶ sell
//   ─flood─▶ buy ─flood─▶ settle ─flood─▶ stake (─flood─▶ /proof) ─iris─▶ outro (MG)
//
// Recorded scenes fall back to recordings/_sample when their own capture is missing. Edit lists: camera/sceneConfig.ts.
import React from 'react'
import { AbsoluteFill, Audio, Freeze, Sequence, useCurrentFrame } from 'remotion'
import { RecordedScene, type OverlayCtx } from './camera/RecordedScene'
import { cues, sfxFile, SWELL_LEAD, useAvailableSfx, VOL, WHOOSH_LEAD, type Cue, type Sfx } from './camera/cues'
import { LANDING_PRE, RECORDED, SCENE_CFG, slot, STAKE_PROOF_CUT, TIMELINE, type RecordedId } from './camera/sceneConfig'
import { timeMap, toScene } from './camera/timeMap'
import { useRecording, type RecEvent, type Rect } from './camera/useRecording'
import { Callout, StepChips, TokenFlow } from './mg/Callout'
import { NftCard } from './mg/NftCard'
import { Outro } from './mg/Outro'
import { Welcome, WELCOME_EXIT_START, welcomeExitClipPath } from './mg/Welcome'
import { Flood } from './mg/transitions/Flood'
import { C, FPS, H, W } from './theme'
import { F } from './mg/fonts'
import { sprog } from './mg/motion'
import type { OverlayCtx as Ctx } from './camera/RecordedScene'

const FLOOD = 14 // frames each way (flood in over the outgoing scene, out over the incoming one)
/**
 * Welcome frame where the logo lands: the mark's lift (eprog 150..206, ease-out) settles at ~168, just before the
 * headline rises at 176. The swell's hit (2.8 s into the file) lands there, so the swell starts at frame 0.
 */
const WELCOME_LOGO_LAND = 168

// ---------------------------------------------------------------------------------------------
// MG pieces on top of recorded scenes (Callout / StepChips / NftCard / TokenFlow from src/mg). Rects are page px
// mapped through the camera, timed off the recording's events; tune once real recordings exist.
// ---------------------------------------------------------------------------------------------
type Overlay = (ctx: OverlayCtx) => React.ReactNode
const find = <T extends RecEvent['type']>(ctx: Ctx, type: T, pred: (e: Extract<RecEvent, { type: T }>) => boolean = () => true) =>
  ctx.rec.events.find((e): e is Extract<RecEvent, { type: T }> => e.type === type && pred(e as Extract<RecEvent, { type: T }>))
const TOAST: Rect = { x: 1580, y: 962.7, w: 320, h: 97.3 } // TxStatus toast, bottom right
const NAV_POSITIONS: Rect = { x: 841.3, y: 26, w: 82.3, h: 28 } // nav "Positions" link
const rectOf = (v: unknown, fb: Rect): Rect => (v && typeof v === 'object' && 'x' in v ? (v as Rect) : fb)

/** how: FlowStory steps shown (flow-step mark index) and the chip each one lights. Expire (step 3) is cut. */
const HOW_STEPS = [0, 1, 2, 4]
/** Scene frames where each chip lights: the flow-step marks through the how edit list. */
export const HOW_CHIPS = (() => {
  const segs = SCENE_CFG.how.segments!
  const marks = [117, 334, 550, 768, 985] // flow-step settle frames in recordings/how
  const m = timeMap(0, [], 1, segs)
  // light each chip as its card slides in, a little before the step settles
  return HOW_STEPS.map((i) => Math.max(8, Math.round(toScene(m, marks[i])) - 22))
})()

const OVERLAYS: Partial<Record<RecordedId, Overlay>> = {
  // how: "Lock · Fill · Settle · Split" chips light as FlowStory steps #1, #2, #3 and #5 settle.
  how: () => <StepChips at={HOW_CHIPS} center={{ x: W / 2, y: H - 96 }} exit={slot('how').dur - 22} />,
  // sell: "Collateral locked on-chain" pinned to the Confirmed toast at the collateral-locked mark.
  sell: (ctx) => {
    const m = find(ctx, 'mark', (e) => e.name === 'collateral-locked')
    if (!m) return null
    const at = Math.round(ctx.sceneFrame(m.f))
    if (at < 0) return null
    return (
      <ZoomScaled ctx={ctx} rect={ctx.rectToScreen(rectOf(m.data?.toast, TOAST))}>
        {(r) => <Callout rect={r} label="Collateral locked on-chain" sub="1 NVDA · escrowed" icon="lock" side="top" distance={80} enter={at} exit={at + 150} />}
      </ZoomScaled>
    )
  },
  // buy: the option NFT (real tokenURI art) flips out of the Confirmed toast and flies into Positions.
  buy: (ctx) => {
    const m = find(ctx, 'mark', (e) => e.name === 'nft-minted')
    if (!m) return null
    const at = Math.round(ctx.sceneFrame(m.f))
    if (at < 0) return null
    const svg = typeof m.data?.svg === 'string' ? m.data.svg : undefined
    return <NftCard svgUrl={svg} from={ctx.rectToScreen(rectOf(m.data?.toast, TOAST))} to={ctx.rectToScreen(rectOf(m.data?.positionsRect, NAV_POSITIONS))} start={at} />
  },
  // settle: at `settled`, NVDA moves escrow -> buyer and ETH buyer -> seller.
  settle: (ctx) => {
    const m = find(ctx, 'mark', (e) => e.name === 'settled')
    if (!m) return null
    const at = Math.round(ctx.sceneFrame(m.f))
    if (at < 0) return null
    const p = (k: keyof typeof SETTLE_FLOW) => ctx.toScreen(SETTLE_FLOW[k])
    const seller = p('seller')
    return (
      <>
        <TokenFlow enter={at + 10} stagger={18} exit={at + 100} flows={[
          { from: p('escrow'), to: p('buyer'), label: 'NVDA → buyer', icon: 'coin', bend: -0.15 },
          { from: p('buyer2'), to: p('seller'), label: 'ETH → seller', icon: 'coin', color: C.cyan, bend: -0.22 },
        ]} />
        <EndChip x={seller.x} y={seller.y} enter={at + 28} exit={at + 100} label="Seller" sub="0x3C44…93BC" color={C.cyan} />
      </>
    )
  },
}
/**
 * settle token-flow anchors, page px (camera is at 1.25 on the top of the page here): the held CALL row -> the buyer's address chip in the nav,
 * then the buyer's address -> a "Seller" chip at the right, inside the 64 px safe margin, clear of the Exercise button.
 */
const SETTLE_FLOW = { escrow: { x: 640, y: 352 }, buyer: { x: 1410, y: 70 }, buyer2: { x: 1505, y: 70 }, seller: { x: 1580, y: 500 } }

/** Endpoint chip for a token flow (e.g. the seller, who is not on the page). Centered under (x, y). */
const EndChip: React.FC<{ x: number; y: number; label: string; sub?: string; color: string; enter: number; exit: number }> = ({ x, y, label, sub, color, enter, exit }) => {
  const f = useCurrentFrame()
  const p = sprog(f, enter, 18) * (1 - sprog(f, exit, 24))
  if (p <= 0.001) return null
  return (
    <div style={{
      position: 'absolute', left: x, top: y + 6, transform: `translate(-50%, 0) translateY(${(1 - p) * 10}px)`, opacity: p,
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 999, whiteSpace: 'nowrap',
      background: 'rgba(24,24,24,0.92)', border: `1px solid ${color}`, boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: 8, background: color }} />
      <span style={{ fontFamily: F.body, fontSize: 18, fontWeight: 500, color: C.ink }}>{label}</span>
      {sub && <span style={{ fontFamily: F.mono, fontSize: 14, color: C.muted, letterSpacing: '0.04em' }}>{sub}</span>}
    </div>
  )
}

/**
 * Renders an MG piece at a size that follows the camera (1x at zoom <= 1.43, up to 1.4x at 2x), keeping its
 * rect pinned: the rect is shrunk about its centre by 1/s, then the whole layer is scaled by s about that centre.
 */
const ZoomScaled: React.FC<{ ctx: OverlayCtx; rect: Rect; children: (r: Rect) => React.ReactNode }> = ({ ctx, rect, children }) => {
  const s = Math.min(1.4, Math.max(1, ctx.cam.z * 0.7))
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2
  const r = { x: cx - rect.w / s / 2, y: cy - rect.h / s / 2, w: rect.w / s, h: rect.h / s }
  return <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: `${cx}px ${cy}px` }}>{children(r)}</AbsoluteFill>
}

const Recorded: React.FC<{ id: RecordedId }> = ({ id }) => <RecordedScene id={id} {...SCENE_CFG[id]} overlay={OVERLAYS[id]} />

/** Landing sits above Welcome and is revealed under the rising price line for its first LANDING_PRE frames. */
const LandingUnderWelcome: React.FC = () => {
  const f = useCurrentFrame()
  const clip = f < LANDING_PRE ? welcomeExitClipPath(WELCOME_EXIT_START + f) : undefined
  return <AbsoluteFill style={{ clipPath: clip }}><Recorded id="landing" /></AbsoluteFill>
}

/** Sound cues of one recorded scene, mapped into film frames and clipped to the scene's slot. */
const SceneSfx: React.FC<{ id: RecordedId; from: number; dur: number; have: Set<Sfx> }> = ({ id, from, dur, have }) => {
  const own = useRecording(id)
  const fb = useRecording('_sample')
  const rec = own ?? fb
  if (!rec) return null
  const cfg = SCENE_CFG[id]
  const map = timeMap(cfg.startFrom, cfg.holds, cfg.playbackRate, cfg.segments)
  const list: Cue[] = cues(rec.events)
    .map((c) => ({ c, s: toScene(map, c.frame) }))
    .filter(({ s }) => s >= 0 && s < dur)
    .map(({ c, s }) => ({ ...c, frame: Math.round(from + s) }))
  return <>{list.map((c, i) => <SfxAt key={i} cue={c} have={have} />)}</>
}

const SfxAt: React.FC<{ cue: Cue; have: Set<Sfx> }> = ({ cue, have }) =>
  have.has(cue.sfx) ? (
    <Sequence from={cue.frame} durationInFrames={3 * FPS} layout="none">
      <Audio src={sfxFile(cue.sfx)} volume={cue.volume ?? 1} />
    </Sequence>
  ) : null

export const Film: React.FC = () => {
  const have = useAvailableSfx()
  const welcome = slot('welcome'), outro = slot('outro'), landing = slot('landing')
  const recorded = TIMELINE.filter((s) => (RECORDED as readonly string[]).includes(s.id)) as { id: RecordedId; from: number; dur: number }[]
  // boundaries that get a color flood: every cut between recorded scenes (welcome match-cuts, outro irises)
  const cuts = [...TIMELINE.slice(2, -1).map((s) => s.from), slot('stake').from + STAKE_PROOF_CUT].sort((a, b) => a - b)
  return (
    <AbsoluteFill style={{ background: C.bg, width: W, height: H }}>
      <Sequence from={welcome.from} durationInFrames={welcome.dur} name="welcome (MG)">
        <Welcome />
      </Sequence>
      <Sequence from={landing.from - LANDING_PRE} durationInFrames={landing.dur + LANDING_PRE} name="landing">
        <LandingUnderWelcome />
      </Sequence>
      {recorded.filter((s) => s.id !== 'landing').map((s) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.dur} name={s.id}>
          <Recorded id={s.id} />
        </Sequence>
      ))}
      <Sequence from={outro.from} durationInFrames={outro.dur} name="outro (MG)">
        {/* the iris closes over the stake scene's last frame */}
        <Outro>
          <Freeze frame={slot('stake').dur - 1}><Recorded id="stake" /></Freeze>
        </Outro>
      </Sequence>
      {cuts.map((b) => (
        <Sequence key={b} from={b - FLOOD} durationInFrames={FLOOD * 2} name="flood">
          <Sequence durationInFrames={FLOOD} layout="none"><Flood start={0} dur={FLOOD} mode="in" /></Sequence>
          <Sequence from={FLOOD} layout="none"><Flood start={0} dur={FLOOD} mode="out" /></Sequence>
        </Sequence>
      ))}

      {/* sound */}
      {have && (
        <>
          <SfxAt cue={{ frame: Math.max(0, WELCOME_LOGO_LAND - SWELL_LEAD), sfx: 'swell', volume: VOL.swell }} have={have} />
          {[landing.from, ...cuts].map((b) => <SfxAt key={`w${b}`} cue={{ frame: b - WHOOSH_LEAD, sfx: 'whoosh', volume: VOL.whoosh }} have={have} />)}
          {HOW_CHIPS.map((f) => <SfxAt key={`t${f}`} cue={{ frame: slot('how').from + f, sfx: 'tick', volume: VOL.tick }} have={have} />)}
          <SfxAt cue={{ frame: outro.from, sfx: 'outro', volume: VOL.outro }} have={have} />
          {recorded.map((s) => {
            const pre = s.id === 'landing' ? LANDING_PRE : 0
            return <SceneSfx key={s.id} id={s.id} from={s.from - pre} dur={s.dur + pre} have={have} />
          })}
        </>
      )}
    </AbsoluteFill>
  )
}

export const FILM_FRAMES = TIMELINE[TIMELINE.length - 1].from + TIMELINE[TIMELINE.length - 1].dur
