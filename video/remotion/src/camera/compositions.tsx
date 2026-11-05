import React from 'react'
import { Composition, staticFile } from 'remotion'
import { FPS, H, W } from '../theme'
import { RecordedScene } from './RecordedScene'
import { RECORDED, SCENE_CFG, slot } from './sceneConfig'

type P = { id: string }
const SceneComp: React.FC<P> = ({ id }) => <RecordedScene id={id} {...(SCENE_CFG as Record<string, object>)[id]} />

/** Scene-<id> for each recorded scene (slot length), plus Scene-sample (recordings/_sample) (its full recording length). */
export const CameraCompositions: React.FC = () => (
  <>
    <Composition
      id="Scene-sample" component={SceneComp} defaultProps={{ id: '_sample' }} durationInFrames={360} fps={FPS} width={W} height={H}
      calculateMetadata={async ({ props }) => {
        const r = await fetch(staticFile(`recordings/${props.id}/events.json`)).catch(() => null)
        const frames = r && r.ok ? ((await r.json()) as { frames: number }).frames : 360
        return { durationInFrames: Math.max(1, frames) }
      }}
    />
    {RECORDED.map((id) => (
      <Composition key={id} id={`Scene-${id}`} component={SceneComp} defaultProps={{ id }} durationInFrames={slot(id).dur} fps={FPS} width={W} height={H} />
    ))}
  </>
)
