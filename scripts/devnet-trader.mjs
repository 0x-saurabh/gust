// Devnet only: a small trader that swaps on the Uniswap v4 pools every few seconds so the price feed has
// real candles. Buys are exact input in WETH, sells are exact output in WETH, so every trade is sized in ETH.
//   node scripts/devnet-trader.mjs            env: INTERVAL_MS (4000), MAX_ETH (0.25)
import fs from 'node:fs'
import { createPublicClient, createWalletClient, encodeAbiParameters, http, keccak256, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC = 'http://127.0.0.1:8547'
const chain = { id: 31337, name: 'devnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const dep = JSON.parse(fs.readFileSync('contracts/deployments/31337.json', 'utf8'))
if (dep.chainId && dep.chainId !== 31337) throw new Error('devnet only')
const abiOf = (f, n) => JSON.parse(fs.readFileSync(`contracts/out/${f}/${n}.json`, 'utf8')).abi
const SWAP = abiOf('PoolSwapTest.sol', 'PoolSwapTest')
const ERC20 = abiOf('Mocks.sol', 'MockERC20')
const MIN_SQRT = 4295128739n + 1n
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n
const INTERVAL = Number(process.env.INTERVAL_MS || 4000)
const MAX_ETH = Number(process.env.MAX_ETH || 0.25)

// anvil #6 and #7
const traders = ['0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e', '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356'].map(privateKeyToAccount)
const pub = createPublicClient({ chain, transport: http(RPC), pollingInterval: 300 })
const wallets = traders.map((a) => createWalletClient({ account: a, chain, transport: http(RPC), pollingInterval: 300 }))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[trader]', ...a)

const pools = Object.entries(dep.pools).map(([symbol, key]) => {
  const token = symbol === 'KYTE' ? dep.kyteToken : dep.tokens[symbol]
  return { symbol, key, token, wethIs0: key.currency0.toLowerCase() === dep.weth.toLowerCase(), drift: 0 }
})

async function setup() {
  for (const [i, t] of traders.entries()) {
    await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'anvil_setBalance', params: [t.address, '0x' + (1000n * 10n ** 18n).toString(16)] }) })
    const w = wallets[i]
    const mint = async (addr, amt) => pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: addr, abi: ERC20, functionName: 'mint', args: [t.address, amt] }) })
    const approve = async (addr) => pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: addr, abi: ERC20, functionName: 'approve', args: [dep.uniswapV4SwapRouter, 2n ** 255n] }) })
    await mint(dep.weth, parseEther('500'))
    await approve(dep.weth)
    for (const p of pools) {
      const dec = await pub.readContract({ address: p.token, abi: ERC20, functionName: 'decimals' })
      await mint(p.token, 10n ** 9n * 10n ** BigInt(dec))
      await approve(p.token)
    }
  }
  log(`ready: ${pools.map((p) => p.symbol).join(', ')}`)
}

async function trade() {
  const kyteIdx = pools.findIndex((x) => x.symbol === 'KYTE')
  const p = Math.random() < 0.3 ? pools[kyteIdx] : pools[(kyteIdx + 1 + Math.floor(Math.random() * (pools.length - 1))) % pools.length]
  // gentle random walk with a little momentum so candles look like a market, not noise
  p.drift = p.drift * 0.7 + (Math.random() - 0.5) * 0.6
  const buy = Math.random() < 0.5 + p.drift * 0.4
  const ethAmt = parseEther((0.01 + Math.random() * MAX_ETH).toFixed(6))
  const zeroForOne = buy ? p.wethIs0 : !p.wethIs0
  // Most pools: buy = exact WETH in, sell = exact WETH out. The hooked KYTE pool trades in KYTE terms instead
  // (sell = exact KYTE in, buy = exact KYTE out), which puts WETH on the fee side so KyteHook's fee path runs.
  let amountSpecified = buy ? -ethAmt : ethAmt
  if (p.symbol === 'KYTE') {
    const kyteAmt = ethAmt * 1_000_000n // ~1M KYTE per ETH at the seeded price
    amountSpecified = buy ? kyteAmt : -kyteAmt
  }
  const params = { zeroForOne, amountSpecified, sqrtPriceLimitX96: zeroForOne ? MIN_SQRT : MAX_SQRT }
  const i = Math.floor(Math.random() * wallets.length)
  try {
    const hash = await wallets[i].writeContract({
      address: dep.uniswapV4SwapRouter, abi: SWAP, functionName: 'swap',
      args: [p.key, params, { takeClaims: false, settleUsingBurn: false }, '0x'],
    })
    const r = await pub.waitForTransactionReceipt({ hash })
    log(`${buy ? 'buy ' : 'sell'} ${p.symbol.padEnd(4)} ${(Number(ethAmt) / 1e18).toFixed(3)} ETH ${r.status}`)
  } catch (e) {
    log('swap failed:', e.shortMessage ?? e.message)
  }
}

await setup()
await trade()
if (process.env.ONCE) process.exit(0)
setInterval(trade, INTERVAL)
export const poolId = (k) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]))
