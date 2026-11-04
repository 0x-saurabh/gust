// Markets v2 timelock plans, in the format safe-run.mjs reads (one file per Safe transaction).
//
//   node scripts/mainnet/v2-plan.mjs record     # after DeployMarketsV2: add v2.fromBlock (L2) from the broadcast receipts
//   node scripts/mainnet/v2-plan.mjs plan       # write scripts/mainnet/out/v2-plan-<n>-4663.json, print their paths
//
// What gets listed in the v2 AssetRegistry (one `addAssets` per batch of BATCH tokens, puts on):
//   * every active Robinhood Stock Token deployed on this chain (api.robinhood.com/rhj/assets), with an exposure cap
//     worth CAP_USD at the current quote and a minimum total strike of MIN_STRIKE_ETH;
//   * every token still enabled in the v1 registry, with its v1 cap, minimum strike and puts flag;
//   * the trending crypto tokens in scripts/mainnet/v2-extra-tokens.json, capped at their capUsd (DexScreener price).
// Two listed tokens may not share an on-chain symbol (prices, charts and offers are keyed by symbol): the plan refuses.
// Plus callMarket.setRouter / putMarket.setRouter. Tokens already listed in v2 are skipped. The plan is computed once
// and cached (scripts/mainnet/out/v2-plans-<chain>.json) so a re-run resumes the same timelock operations instead of
// making new ones from moved prices; delete that file to recompute.
import fs from 'node:fs'
import { createPublicClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, parseAbi, parseEther } from 'viem'

const MODE = process.argv[2] || 'plan'
const CHAIN_ID = process.env.CHAIN_ID || '4663'
const RPC = process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const BATCH = Number(process.env.BATCH || 40)
const BATCHES_PER_TX = Number(process.env.BATCHES_PER_TX || 2) // ~4 M gas per batch of 40; keep each Safe tx far below 32 M
const CAP_USD = Number(process.env.CAP_USD || 50_000)
const MIN_STRIKE = parseEther(process.env.MIN_STRIKE_ETH || '0.0001')
const DEP_FILE = process.env.DEP_FILE || `contracts/deployments/${CHAIN_ID}.json`
const OUT = process.env.OUT_DIR || 'scripts/mainnet/out'
const CACHE = `${OUT}/v2-plans-${CHAIN_ID}.json`
const dep = JSON.parse(fs.readFileSync(DEP_FILE, 'utf8'))
const client = createPublicClient({ transport: http(RPC, { retryCount: 6, retryDelay: 1500 }) })
const ZERO32 = '0x' + '0'.repeat(64)

if (MODE === 'record') {
  if (!dep.v2) throw new Error(`${DEP_FILE} has no v2 section: run DeployMarketsV2 first`)
  if (dep.v2.fromBlock) { console.log(`v2.fromBlock already set (${dep.v2.fromBlock})`); process.exit(0) }
  const run = JSON.parse(fs.readFileSync(`contracts/broadcast/DeployMarketsV2.s.sol/${CHAIN_ID}/run-latest.json`, 'utf8'))
  const blocks = run.receipts.map((r) => Number(r.blockNumber))
  if (!blocks.length) throw new Error('no receipts in the broadcast file')
  const v2Addrs = new Set(Object.values(dep.v2).map((a) => String(a).toLowerCase()))
  const created = run.receipts.filter((r) => r.contractAddress && v2Addrs.has(r.contractAddress.toLowerCase()))
  if (!created.length) throw new Error('broadcast receipts do not match the v2 addresses in the deployment file')
  dep.v2.fromBlock = Math.min(...blocks)
  fs.writeFileSync(DEP_FILE, JSON.stringify(dep, null, 2) + '\n')
  console.log(`v2.fromBlock = ${dep.v2.fromBlock}`)
  process.exit(0)
}

if (!dep.v2?.assetRegistry) throw new Error(`${DEP_FILE} has no v2 section: run DeployMarketsV2 first`)
const reg = getAddress(dep.v2.assetRegistry)
const abi = parseAbi([
  'function addAssets(address[] tokens, uint256[] caps, uint256[] minStrikes, bool putsOn)',
  'function setRouter(address router)',
  'function router() view returns (address)',
  'function assetCount() view returns (uint256)',
  'function listedTokens(uint256) view returns (address)',
  'function getAsset(address) view returns ((bool listed, bool enabled, bool putsEnabled, uint8 decimals, uint256 cap, uint256 minStrike))',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function getMinDelay() view returns (uint256)',
  'function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function execute(address target, uint256 value, bytes payload, bytes32 predecessor, bytes32 salt)',
])
const read = (address, functionName, args = []) => client.readContract({ address, abi, functionName, args })

async function computeCalls() {
  const delay = await read(dep.timelock, 'getMinDelay')
  const call = (label, target, data) => {
    const salt = keccak256(encodeAbiParameters([{ type: 'string' }], [`kyte-v2:${label}`]))
    return {
      label, target: getAddress(target), data, salt,
      schedule: encodeFunctionData({ abi, functionName: 'schedule', args: [target, 0n, data, ZERO32, salt, delay] }),
      execute: encodeFunctionData({ abi, functionName: 'execute', args: [target, 0n, data, ZERO32, salt] }),
    }
  }
  const calls = []
  for (const m of ['callMarket', 'putMarket']) {
    if (getAddress(await read(dep.v2[m], 'router')) !== getAddress(dep.v2.router)) {
      calls.push(call(`${m}.setRouter ${dep.v2.router}`, dep.v2[m], encodeFunctionData({ abi, functionName: 'setRouter', args: [dep.v2.router] })))
    }
  }

  // Already listed in v2: skip.
  const n = Number(await read(reg, 'assetCount'))
  const listed = new Set()
  for (let i = 0; i < n; i++) listed.add((await read(reg, 'listedTokens', [BigInt(i)])).toLowerCase())

  const want = new Map() // address -> { symbol, cap, minStrike, puts }
  // v1 tokens that are still enabled keep their parameters.
  const v1n = Number(await read(dep.assetRegistry, 'assetCount'))
  for (let i = 0; i < v1n; i++) {
    const t = await read(dep.assetRegistry, 'listedTokens', [BigInt(i)])
    const a = await read(dep.assetRegistry, 'getAsset', [t])
    if (a.enabled) want.set(t.toLowerCase(), { symbol: `v1:${t.slice(0, 8)}`, cap: a.cap, minStrike: a.minStrike, puts: a.putsEnabled })
  }
  // Every active Robinhood Stock Token on this chain, capped at CAP_USD of exposure per market.
  const [{ assets }, { quotes }] = await Promise.all([
    fetch('https://api.robinhood.com/rhj/assets').then((r) => r.json()),
    fetch('https://api.robinhood.com/rhj/prices').then((r) => r.json()),
  ])
  const usd = new Map(quotes.map((q) => [q.tokenSymbol, Number(q.tokenBid || q.bid) || 0]))
  for (const a of assets) {
    if (a.status !== 'ASSET_STATUS_ACTIVE') continue
    const d = (a.deployments ?? []).find((x) => String(x.chainId) === CHAIN_ID)
    if (!d) continue
    const addr = getAddress(d.contractAddress)
    if (want.has(addr.toLowerCase())) continue
    const dec = Number(await read(addr, 'decimals'))
    const price = usd.get(a.tokenSymbol) || 100 // unquoted (new listing): assume $100 until the timelock adjusts it
    const tokens = Math.max(1, Math.ceil(CAP_USD / price))
    want.set(addr.toLowerCase(), { symbol: a.tokenSymbol, cap: BigInt(tokens) * 10n ** BigInt(dec), minStrike: MIN_STRIKE, puts: true })
  }
  // Trending crypto tokens (screened list), capped at capUsd of exposure at the DexScreener price.
  const extras = JSON.parse(fs.readFileSync(process.env.EXTRA_TOKENS || 'scripts/mainnet/v2-extra-tokens.json', 'utf8')).tokens ?? []
  if (extras.length) {
    const addrs = extras.map((e) => getAddress(e.address))
    const usdOf = new Map()
    for (let i = 0; i < addrs.length; i += 30) {
      const pairs = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${addrs.slice(i, i + 30).join(',')}`).then((r) => r.json())
      for (const p of pairs) {
        const k = p.baseToken.address.toLowerCase()
        if (!usdOf.has(k) || (p.liquidity?.usd ?? 0) > usdOf.get(k).liq) usdOf.set(k, { usd: Number(p.priceUsd), liq: p.liquidity?.usd ?? 0 })
      }
    }
    for (const e of extras) {
      const addr = getAddress(e.address)
      if (want.has(addr.toLowerCase())) continue
      const price = usdOf.get(addr.toLowerCase())?.usd
      if (!(price > 0)) throw new Error(`no DexScreener price for ${e.symbol} (${addr}): fix or remove it in v2-extra-tokens.json`)
      const dec = Number(await read(addr, 'decimals'))
      const raw = BigInt(Math.ceil((e.capUsd / price) * 1e6)) * 10n ** BigInt(dec) / 1_000_000n
      want.set(addr.toLowerCase(), { symbol: e.symbol, cap: raw > 0n ? raw : 1n, minStrike: MIN_STRIKE, puts: true })
    }
  }

  // One symbol, one token: the indexer, charts and offers are keyed by the on-chain symbol.
  const bySymbol = new Map()
  for (const t of [...want.keys(), ...listed]) {
    const sym = await read(getAddress(t), 'symbol')
    if (bySymbol.has(sym) && bySymbol.get(sym) !== t) throw new Error(`two tokens use the symbol ${sym}: ${bySymbol.get(sym)} and ${t}. List only one.`)
    bySymbol.set(sym, t)
  }
  for (const t of listed) want.delete(t)

  // Batches with one puts flag each.
  for (const puts of [true, false]) {
    const rows = [...want.entries()].filter(([, w]) => w.puts === puts)
    for (let i = 0; i < rows.length; i += BATCH) {
      const b = rows.slice(i, i + BATCH)
      const data = encodeFunctionData({
        abi, functionName: 'addAssets',
        args: [b.map(([t]) => getAddress(t)), b.map(([, w]) => w.cap), b.map(([, w]) => w.minStrike), puts],
      })
      calls.push(call(`registry.addAssets ${b.map(([, w]) => w.symbol).join(',')}${puts ? ' (puts on)' : ''}`, reg, data))
    }
  }
  return { delay: Number(delay), calls, tokens: want.size }
}

fs.mkdirSync(OUT, { recursive: true })
let plan
if (fs.existsSync(CACHE)) {
  plan = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
  if (plan.registry !== reg) throw new Error(`${CACHE} was made for registry ${plan.registry}, not ${reg}: delete it`)
  console.log(`using cached plan ${CACHE} (${plan.calls.length} operations)`)
} else {
  const c = await computeCalls()
  plan = { registry: reg, timelock: getAddress(dep.timelock), ...c }
  fs.writeFileSync(CACHE, JSON.stringify(plan, null, 2))
  console.log(`${c.tokens} tokens to list in ${c.calls.length} timelock operations, delay ${c.delay}s`)
}
// One file per Safe transaction: the two setRouter calls ride along with the first batches.
const ops = plan.calls
const files = []
let i = 0
while (i < ops.length) {
  const chunk = []
  let batches = 0
  while (i < ops.length && (batches < BATCHES_PER_TX || !ops[i].label.startsWith('registry.addAssets'))) {
    if (ops[i].label.startsWith('registry.addAssets')) batches++
    chunk.push(ops[i++])
  }
  const f = `${OUT}/v2-plan-${files.length + 1}-${CHAIN_ID}.json`
  fs.writeFileSync(f, JSON.stringify({ timelock: plan.timelock, delay: plan.delay, calls: chunk }, null, 2))
  files.push(f)
}
console.log(files.join('\n'))
