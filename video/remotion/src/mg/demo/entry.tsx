// MG-only entry for fast stills, independent of the rest of Root (see stills.mjs).
import { registerRoot } from 'remotion'
import { MgCompositions } from '../compositions'
registerRoot(() => <MgCompositions />)
