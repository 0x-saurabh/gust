// JSON-RPC proxy between anvil and the public Robinhood Chain RPC, so a long-running fork never dies.
//
//   node video/env/fork-proxy.mjs          # PORT 8548, UPSTREAM https://rpc.mainnet.chain.robinhood.com
//
// Why: the public RPC is not an archive node; it keeps state for only ~6-10k blocks (~10-15 min). anvil reads
// state lazily at its fork block, so ~15 min after start any account or storage slot it has not touched yet fails
// with "historical state ... is not available" (the site then shows reverted reads). This proxy retries such state
// reads at "latest" instead. The value can be a few minutes newer than the fork block: harmless for a demo.
// Read-only: anvil never sends transactions upstream (they are mined locally).
import http from 'node:http'

const PORT = Number(process.env.PORT || 8548)
const UPSTREAM = process.env.UPSTREAM || 'https://rpc.mainnet.chain.robinhood.com'
// method -> index of its block-tag parameter
const BLOCK_PARAM = { eth_getBalance: 1, eth_getCode: 1, eth_getTransactionCount: 1, eth_getStorageAt: 2, eth_call: 1, eth_getProof: 2, eth_getAccount: 1 }
const PRUNED = /historical state|missing trie node|state .* not available|header not found/i
let retried = 0, served = 0

async function post(body) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(UPSTREAM, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
      if (r.status === 429 && attempt < 6) { await new Promise((s) => setTimeout(s, 500 * 2 ** attempt)); continue }
      return await r.json()
    } catch (e) {
      if (attempt >= 4) throw e
      await new Promise((s) => setTimeout(s, 300 * 2 ** attempt))
    }
  }
}

// Highest block number seen pruned: later reads at or below it go straight to "latest" (one round trip, ~0.4 s,
// instead of a failing one first). anvil reads every fresh storage slot (each new offer writes several) this way.
let prunedAt = -1
const blockNum = (tag) => (typeof tag === 'string' && /^0x[0-9a-f]+$/i.test(tag) ? parseInt(tag, 16) : typeof tag === 'object' && tag?.blockNumber ? parseInt(tag.blockNumber, 16) : NaN)
async function one(req) {
  served++
  const i = BLOCK_PARAM[req.method]
  const atLatest = () => { const params = req.params.slice(); params[i] = 'latest'; return post({ ...req, params }).then((r) => ({ ...r, id: req.id })) }
  if (i !== undefined && Array.isArray(req.params) && blockNum(req.params[i]) <= prunedAt) { retried++; return atLatest() }
  const res = await post(req)
  if (res?.error && i !== undefined && PRUNED.test(res.error.message || '') && Array.isArray(req.params)) {
    retried++
    const n = blockNum(req.params[i])
    if (n > prunedAt) prunedAt = n
    return atLatest()
  }
  return res
}

http.createServer((req, res) => {
  let data = ''
  req.on('data', (c) => (data += c))
  req.on('end', async () => {
    try {
      const body = JSON.parse(data)
      const out = Array.isArray(body) ? await Promise.all(body.map(one)) : await one(body)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(out))
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: `fork-proxy: ${e.message}` } }))
    }
  })
}).listen(PORT, '127.0.0.1', () => console.log(`[fork-proxy] 127.0.0.1:${PORT} -> ${UPSTREAM}`))

setInterval(() => { if (retried) console.log(`[fork-proxy] ${served} requests, ${retried} pruned-state reads retried at latest`) }, 60_000).unref()
