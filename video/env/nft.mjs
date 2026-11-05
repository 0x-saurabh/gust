// Read an option NFT's on-chain art from the local fork and write it as an SVG file.
//
//   node video/env/nft.mjs <tokenId> [out.svg]        # default out: $DEMO_DIR/nft-<tokenId-tail>.svg
//
// tokenURI is `data:application/json;base64,...` (or utf8) with an `image` that is itself an SVG data URI.
// The NFT contract is picked from the id's version tag (id >> 248): 5/6 = v3, 3/4 = v2, else v1.
// Also writes <out>.json with the decoded metadata (name, description, attributes) beside the SVG.
import { createPublicClient, http, parseAbi } from 'viem'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const RPC = process.env.RPC_URL || 'http://127.0.0.1:8549'
const DEMO_DIR = process.env.DEMO_DIR || path.join(process.env.CLAUDE_JOB_DIR || '/Users/apple/.claude/jobs/9eeca95c', 'tmp/demo')
const [idArg, outArg] = process.argv.slice(2)
if (!idArg) { console.error('usage: node video/env/nft.mjs <tokenId> [out.svg]'); process.exit(1) }
const id = BigInt(idArg)
const dep = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts/deployments/4663.json'), 'utf8'))
const tag = id >> 248n
const nft = tag >= 5n ? dep.v3.optionNft : tag >= 3n ? dep.v2.optionNft : dep.optionNft

const pub = createPublicClient({ transport: http(RPC) })
const uri = await pub.readContract({ address: nft, abi: parseAbi(['function tokenURI(uint256) view returns (string)']), functionName: 'tokenURI', args: [id] })

function decodeDataUri(u) {
  const m = /^data:([^,;]+)((?:;[^,;]+)*),(.*)$/s.exec(u)
  if (!m) throw new Error(`not a data: URI: ${u.slice(0, 60)}…`)
  const body = m[3]
  return /;base64/.test(m[2]) ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body)
}

const meta = JSON.parse(decodeDataUri(uri))
const svg = meta.image?.startsWith('data:') ? decodeDataUri(meta.image) : meta.image_data
if (!svg || !svg.includes('<svg')) throw new Error('metadata has no SVG image')
const out = outArg || path.join(DEMO_DIR, `nft-${id.toString().slice(-6)}.svg`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, svg)
const { image, image_data, ...rest } = meta
fs.writeFileSync(out.replace(/\.svg$/, '') + '.json', JSON.stringify(rest, null, 2) + '\n')
console.log(`[nft] ${nft} #${id} -> ${out} (${svg.length} bytes) "${meta.name ?? ''}"`)
