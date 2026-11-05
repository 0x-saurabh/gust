// Render MG stills fast (one bundle, many frames).
// usage: node src/mg/demo/stills.mjs MG-Welcome:20,60,120 MG-Outro:100
import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..')
const out = path.resolve(root, '../out/stills')
fs.mkdirSync(out, { recursive: true })
const serveUrl = await bundle({ entryPoint: path.join(root, process.env.MG_ENTRY ?? 'src/mg/demo/entry.tsx') })
for (const arg of process.argv.slice(2)) {
  const [id, frames] = arg.split(':')
  const composition = await selectComposition({ serveUrl, id, inputProps: {} })
  for (const f of frames.split(',').map(Number)) {
    const name = `mg-${id.replace(/^MG-/, '').toLowerCase()}-${f}.png`
    await renderStill({ composition, serveUrl, frame: f, output: path.join(out, name), inputProps: {} })
    console.log(path.join(out, name))
  }
}
