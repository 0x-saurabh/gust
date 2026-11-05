import React, { useMemo } from 'react'
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion'
import { C, FPS, H, W, spring01 } from '../theme'
import { Cursor } from './Cursor'
import { timeMap, toRec, toScene, type Hold, type Seg } from './timeMap'
import { framePath, useRecording, type Recording, type Rect } from './useRecording'
import { camTransform, cameraAt, planCamera, toScreen, type Cam, type CameraOverrides } from './zoom'

export type OverlayCtx = {
  rec: Recording
  /** recording frame (fractional) shown on this scene frame */
  recF: number
  /** scene frame */
  frame: number
  cam: Cam
  /** page px -> screen px under the current camera */
  toScreen: (p: { x: number; y: number }) => { x: number; y: number }
  /** page rect -> screen rect under the current camera */
  rectToScreen: (r: Rect) => Rect
  /** recording frame -> scene frame (for timing MG pieces off events) */
  sceneFrame: (recF: number) => number
}

export type RecordedSceneProps = {
  /** recordings/<id>/ */
  id: string
  /** Used when recordings/<id> is missing (default '_sample'). */
  fallback?: string
  /** Trim: first recording frame shown at scene frame 0. */
  startFrom?: number
  /** Freeze the recording at idle frames to stretch the scene (never on an action). */
  holds?: Hold[]
  /** Overall playback rate; keep 1 unless the stretch is idle. */
  playbackRate?: number
  /** Edit list: recording segments played back to back (overrides startFrom/holds/playbackRate). */
  segments?: Seg[]
  /** Per-scene camera tuning; see zoom.ts CameraOpts. */
  camera?: CameraOverrides
  /** Intro framing: start at this zoom (< 1 shows the screen as a rounded card on black) and spring to 1. */
  introZoom?: number
  introW?: number
  cursor?: boolean
  vignette?: boolean
  /** Screen-space overlays anchored to page coordinates (callouts etc). */
  overlay?: (ctx: OverlayCtx) => React.ReactNode
}

const Missing: React.FC<{ id: string }> = ({ id }) => (
  <AbsoluteFill style={{ background: C.card, color: C.muted, alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontSize: 28 }}>
    no recording: {id}
  </AbsoluteFill>
)

const Inner: React.FC<RecordedSceneProps & { rec: Recording }> = ({
  rec, startFrom = 0, holds, playbackRate = 1, segments, camera, introZoom, introW = 9, cursor = true, vignette = true, overlay,
}) => {
  const frame = useCurrentFrame()
  const map = useMemo(() => timeMap(startFrom, holds, playbackRate, segments), [startFrom, holds, playbackRate, segments])
  const plan = useMemo(() => planCamera(rec, camera), [rec, camera])
  const recF = Math.max(0, toRec(map, frame))
  const extra = introZoom !== undefined ? introZoom + (1 - introZoom) * spring01(frame / FPS, introW) : 1
  const cam = cameraAt(plan, recF, extra)
  const n = Math.min(rec.frames - 1, Math.floor(recF + 1e-6)) // past the end: hold the last frame
  const framed = Math.max(0, Math.min(1, (1 - cam.z) / 0.015)) // 0 at z>=1, 1 once clearly below
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: camTransform(cam) }}>
        <div style={{
          position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: (16 / cam.z) * framed,
          boxShadow: framed > 0 ? `0 ${30 / cam.z}px ${90 / cam.z}px rgba(0,0,0,${0.7 * framed}), 0 0 0 ${1 / cam.z}px ${C.border}` : undefined,
        }}>
          <Img src={framePath(rec.id, n)} style={{ width: W, height: H, display: 'block' }} />
        </div>
      </div>
      {vignette && <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 75% at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.26) 100%)', pointerEvents: 'none' }} />}
      {overlay?.({
        rec, recF, frame, cam, toScreen: (p) => toScreen(cam, p),
        rectToScreen: (r) => { const a = toScreen(cam, r); return { x: a.x, y: a.y, w: r.w * cam.z, h: r.h * cam.z } },
        sceneFrame: (f) => toScene(map, f),
      })}
      {cursor && <Cursor rec={rec} f={recF} cam={cam} />}
    </AbsoluteFill>
  )
}

/**
 * A recorded scene: the frame sequence from recordings/<id>/frames, the auto camera, and the cursor.
 * Frames of any resolution are drawn into the 1920x1080 page box; events are in page px.
 */
export const RecordedScene: React.FC<RecordedSceneProps> = (props) => {
  const own = useRecording(props.id)
  const fb = useRecording(props.fallback ?? '_sample')
  if (own === undefined || fb === undefined) return null
  const rec = own ?? fb
  if (!rec) return <Missing id={props.id} />
  return <Inner {...props} rec={rec} />
}
