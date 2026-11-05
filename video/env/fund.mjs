// Fund the demo personas on the local anvil fork (never mainnet: refuses any RPC that is not 127.0.0.1/localhost).
//
//   node video/env/fund.mjs            # RPC_URL defaults to http://127.0.0.1:8549
//
// seller (#0): 50 ETH, 20 NVDA, 20 AAPL, 20 TSLA, 5000 KYTE
// buyer  (#1): 50 ETH, 5000 KYTE (staking scene), 5 NVDA (spare, e.g. to exercise a put)
// seeders (#2-#4): 100 ETH, 50 of each stock token
//
// The anvil dev accounts carry EIP-7702 delegations on Robinhood Chain mainnet (sweeper bots); the fork inherits
// them, so their code is cleared first. ERC-20 balances are written straight into storage: the balance slot is
// found by tracing balanceOf (prestateTracer) and probing each storage slot it reads.
import { createPublicClient, createTestClient, http, parseAbi, parseEther, formatUnits, toHex, pad, getAddress } from 'viem'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const RPC = process.env.RPC_URL || 'http://127.0.0.1:8549'
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(RPC)) throw new Error(`refusing non-local RPC ${RPC}`)

export const PERSONAS = {
  seller: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  buyer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  seeder2: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  seeder3: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  seeder4: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
}
const dep = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts/deployments/4663.json'), 'utf8'))
export const TOKENS = {
  NVDA: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
  AAPL: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
  TSLA: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d',
  KYTE: getAddress(dep.kyteToken),
}

const transport = http(RPC)
const pub = createPublicClient({ transport })
const test = createTestClient({ mode: 'anvil', transport })
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)'])

const chainId = await pub.getChainId()
if (chainId !== 4663) throw new Error(`expected the Robinhood Chain fork (4663), RPC is chain ${chainId}`)

const slotCache = new Map()
/** Storage slot holding `holder`'s balance, found by tracing balanceOf and probing each slot it reads. */
async function balanceSlot(token, holder) {
  const data = (await import('viem')).encodeFunctionData({ abi: erc20, functionName: 'balanceOf', args: [holder] })
  const trace = await pub.request({ method: 'debug_traceCall', params: [{ to: token, data }, 'latest', { tracer: 'prestateTracer' }] })
  const tokenKey = Object.keys(trace).find((k) => k.toLowerCase() === token.toLowerCase())
  const slots = Object.keys(trace[tokenKey]?.storage ?? {})
  for (const slot of slots) {
    const before = await pub.getStorageAt({ address: token, slot })
    const probe = pad(toHex(0x1234567890n), { size: 32 })
    await test.setStorageAt({ address: token, index: slot, value: probe })
    const bal = await pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [holder] })
    await test.setStorageAt({ address: token, index: slot, value: before ?? pad('0x0', { size: 32 }) })
    if (bal !== 0n && bal >= 0x1234567890n / 2n && bal <= 0x1234567890n * 2n) return { slot, ratio: Number(bal) / 0x1234567890 }
  }
  throw new Error(`balance slot not found for ${token} / ${holder} (slots read: ${slots.join(', ')})`)
}

/** Set `holder`'s token balance to `amount` (raw units), compensating a share multiplier if the token has one. */
export async function setTokenBalance(token, holder, amount) {
  const key = `${token}:${holder}`.toLowerCase()
  const s = slotCache.get(key) ?? (await balanceSlot(token, holder))
  slotCache.set(key, s)
  const raw = s.ratio === 1 ? amount : BigInt(Math.ceil(Number(amount) / s.ratio))
  await test.setStorageAt({ address: token, index: s.slot, value: pad(toHex(raw), { size: 32 }) })
  return pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [holder] })
}

const PLAN = {
  seller: { eth: '50', NVDA: '20', AAPL: '20', TSLA: '20', KYTE: '5000' },
  buyer: { eth: '50', KYTE: '5000', NVDA: '5' },
  seeder2: { eth: '100', NVDA: '50', AAPL: '50', TSLA: '50' },
  seeder3: { eth: '100', NVDA: '50', AAPL: '50', TSLA: '50' },
  seeder4: { eth: '100', NVDA: '50', AAPL: '50', TSLA: '50' },
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const decimals = {}
  for (const [sym, t] of Object.entries(TOKENS)) decimals[sym] = await pub.readContract({ address: t, abi: erc20, functionName: 'decimals' })
  for (const [name, plan] of Object.entries(PLAN)) {
    const who = PERSONAS[name]
    await test.setCode({ address: who, bytecode: '0x' }) // drop mainnet 7702 delegation
    await test.setBalance({ address: who, value: parseEther(plan.eth) })
    const out = [`${plan.eth} ETH`]
    for (const [sym, amt] of Object.entries(plan)) {
      if (sym === 'eth') continue
      const bal = await setTokenBalance(TOKENS[sym], who, BigInt(Math.round(Number(amt) * 1e6)) * 10n ** BigInt(decimals[sym] - 6))
      out.push(`${Number(formatUnits(bal, decimals[sym])).toFixed(4)} ${sym}`)
    }
    console.log(`[fund] ${name.padEnd(8)} ${who}  ${out.join(', ')}`)
  }
}
