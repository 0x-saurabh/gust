// Between takes: cancel every open offer the seller/buyer personas wrote (rehearsals, smoke runs), re-fund them,
// and re-seed the offers the film relies on if a rehearsal bought them.
//
//   node video/env/reset.mjs              # cancel persona offers + fund.mjs + reseed missing buy-scene/nvda-5/nvda-10
//
// Seeder offers (anvil #2-#4) are left alone, except that bought ones are replaced.
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RPC = process.env.RPC_URL || 'http://127.0.0.1:8549'
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(RPC)) throw new Error(`refusing non-local RPC ${RPC}`)
const INDEXER = process.env.INDEXER_URL || 'http://127.0.0.1:4299'
const DEMO_DIR = process.env.DEMO_DIR || path.join(process.env.CLAUDE_JOB_DIR || '/Users/apple/.claude/jobs/9eeca95c', 'tmp/demo')
const PERSONAS = ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8']
const chain = { id: 4663, name: 'Robinhood Chain (fork)', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const pub = createPublicClient({ transport: http(RPC) })
const abi = parseAbi(['function cancelUnfilled(uint256 id)'])

const open = await (await fetch(`${INDEXER}/offers`)).json()
for (const o of open.filter((x) => PERSONAS.some((p) => p.toLowerCase() === x.seller.toLowerCase()))) {
  const wallet = createWalletClient({ account: o.seller, chain, transport: http(RPC) })
  const hash = await wallet.writeContract({ address: o.market, abi, functionName: 'cancelUnfilled', args: [BigInt(o.id)] })
  await pub.waitForTransactionReceipt({ hash })
  console.log(`[reset] cancelled ${o.kind} ${o.amount} ${o.symbol} by ${o.seller.slice(0, 6)} (${o.id.slice(-4)})`)
}
execFileSync('node', [path.join(HERE, 'fund.mjs')], { stdio: 'inherit' })

const seeded = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'seeded.json'), 'utf8'))
const openIds = new Set(open.map((o) => o.id))
const missing = ['buy-scene', 'nvda-5', 'nvda-10'].filter((label) => !seeded.offers.some((o) => o.label === label && openIds.has(o.id)))
if (missing.length) execFileSync('node', [path.join(HERE, 'seed.mjs')], { stdio: 'inherit', env: { ...process.env, ONLY: missing.join(',') } })
else console.log('[reset] seeded offers all still open')
