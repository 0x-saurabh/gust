import { Composition } from 'remotion'
import { FPS, H, W } from './theme'
import { MgCompositions } from './mg/compositions'
import { CameraCompositions } from './camera/compositions'
import { Film, FILM_FRAMES } from './Film'

// Placeholder root. Workstreams register their compositions here:
// - Motion graphics: Welcome, Outro, NftCard, Callout demos
// - Camera/compositor: Film (full timeline) and one Scene-<id> per recorded scene
export const Root = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={FILM_FRAMES} fps={FPS} width={W} height={H} />
    <CameraCompositions />
    <MgCompositions />
  </>
)
