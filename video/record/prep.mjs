// Off-camera chain prep for the settle and stake scenes. Local fork (8549) only; anvil signs for its dev accounts.
//
//   node video/record/prep.mjs settle   # buyer: exercise every held call except the film's buy-scene one (clean Holding tab),
//                                       # and buy + exercise the seeded NVDA put so a real WETH payout waits to be unwrapped
//   node video/record/prep.mjs stake    # real fee volume (seeders write, buy and exercise calls), buyer pre-stakes KYTE,
//                                       # advance chain time into the next epoch, FeeVault.split() as the keeper does
//                                       # (and BuybackBurner.buyAndBurn as the keeper account), so Claim WETH is non-zero
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, formatEther, maxUint256 } from 'viem'
import { RPC, INDEXER, deployments, seeded, rpc, PERSONA } from './lib.mjs'

if (!/^https?:\/\/(127\.0\.0\.1|localhost):8549/.test(RPC)) throw new Error(`prep only runs against the local fork on 8549, not ${RPC}`)
const chain = { id: 4663, name: 'Robinhood Chain (fork)', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const pub = createPublicClient({ chain, transport: http(RPC, { timeout: 180_000 }) })
const wallet = (account) => createWalletClient({ account, chain, transport: http(RPC, { timeout: 180_000 }) })
const dep = deployments()
const V3 = dep.v3
const SEEDERS = ['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', '0x90F79bf6EB2c4f870365E785982E1f101E93b906', '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65']
const TOKENS = { NVDA: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', AAPL: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', TSLA: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d' }
const ABI = {
  router: parseAbi(['function exerciseWithETH(uint256 id) payable', 'function buyWithETH(uint256 id, uint256 maxPremium) payable', 'function buyPutWithETH(uint256 id, uint256 maxPremium) payable']),
  put: parseAbi(['function exercisePut(uint256 id)']),
  call: parseAbi(['function createOffer(address token, uint256 amount, uint256 strike, uint256 premium, uint64 expiry, uint64 deadline) returns (uint256)', 'event OfferCreated(uint256 indexed id, address indexed seller, address indexed token, uint256 amount, uint256 strike, uint256 premium, uint64 expiry, uint64 deadline)']),
  erc20: parseAbi(['function approve(address, uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)', 'function allowance(address, address) view returns (uint256)']),
  vault: parseAbi(['function split()', 'function currentEpoch() view returns (uint64)', 'function lastSplitEpoch() view returns (uint64)', 'function stakingPool() view returns (address)']),
  pool: parseAbi(['function stake(uint256)', 'function balancesOf(address) view returns (uint256 active, uint256 pending)', 'function pendingRewards(address) view returns (uint256)', 'function epochEndsAt() view returns (uint256)', 'function currentEpoch() view returns (uint64)', 'function activeSupply() view returns (uint256)']),
  burner: parseAbi(['function buyAndBurn(uint256 wethIn, uint256 minTokenOut, uint256 deadline)', 'function keeper() view returns (address)', 'function adapter() view returns (address)', 'function maxPerCall() view returns (uint256)', 'function paused() view returns (bool)']),
  adapter: parseAbi(['function quoteWethForToken(uint256) view returns (uint256)']),
}
const send = async (from, args, what) => {
  const hash = await wallet(from).writeContract(args)
  const r = await pub.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(`${what} reverted (${hash})`)
  console.log(`[prep] ${what}  ${hash.slice(0, 10)}`)
  return r
}
const offers = async (all) => (await fetch(`${INDEXER}/offers${all ? '?status=all' : ''}`)).json()
const wethOf = (a) => pub.readContract({ address: dep.weth, abi: ABI.erc20, functionName: 'balanceOf', args: [a] })

export async function prepSettle() {
  const keep = seeded().buyScene
  const buyer = PERSONA.buyer
  const held = (await offers(true)).filter((o) => o.status === 'filled' && o.holder?.toLowerCase() === buyer.toLowerCase())
  for (const o of held.filter((o) => o.id !== keep && o.kind === 'call' && o.market.toLowerCase() === V3.callMarket.toLowerCase()))
    await send(buyer, { address: V3.router, abi: ABI.router, functionName: 'exerciseWithETH', args: [BigInt(o.id)], value: BigInt(o.strikeRaw) }, `buyer exercises old ${o.amount} ${o.symbol} call ${o.id.slice(-4)}`)
  if (!held.some((o) => o.id === keep)) console.log('[prep] warning: the buyer does not hold the buy-scene option yet (record buy first)')
  // A real WETH payout for `Unwrap WETH → ETH`: buy the seeded NVDA put and deliver NVDA against it.
  if ((await wethOf(buyer)) === 0n) {
    const put = (await offers()).find((o) => o.kind === 'put' && o.symbol === 'NVDA' && o.seller.toLowerCase() !== buyer.toLowerCase())
    if (!put) throw new Error('no open NVDA put to buy')
    await send(buyer, { address: V3.router, abi: ABI.router, functionName: 'buyPutWithETH', args: [BigInt(put.id), BigInt(put.premiumRaw)], value: BigInt(put.premiumRaw) }, `buyer buys ${put.amount} NVDA put ${put.id.slice(-4)}`)
    await send(buyer, { address: TOKENS.NVDA, abi: ABI.erc20, functionName: 'approve', args: [V3.putMarket, BigInt(put.amountRaw)] }, 'buyer approves NVDA to PutMarket')
    await send(buyer, { address: V3.putMarket, abi: ABI.put, functionName: 'exercisePut', args: [BigInt(put.id)] }, `buyer exercises the put (delivers ${put.amount} NVDA)`)
  }
  // The site unwraps parseEther(balanceFloat.toFixed(18)); a float that rounds above the real balance reverts
  // ("burn amount exceeds balance"). Trim the payout to a multiple of 1/1024 ETH (exact in binary) so it never does.
  const w = await wethOf(buyer)
  const unit = 10n ** 18n / 1024n // 976562500000000 wei, exact
  const trim = w % unit
  if (trim > 0n) await send(buyer, { address: dep.weth, abi: parseAbi(['function withdraw(uint256)']), functionName: 'withdraw', args: [trim] }, `buyer trims WETH by ${formatEther(trim)} (float-safe unwrap)`)
  console.log(`[prep] buyer WETH ${formatEther(await wethOf(buyer))}`)
}

export async function prepStake({ preStake = '4000' } = {}) {
  const buyer = PERSONA.buyer
  const pool = dep.stakingPool
  const vault = dep.feeVault
  // 1) Real fee volume: each seeder writes a weekly ~ATM call on 40 tokens (premium ~2% of notional), the next seeder
  //    buys it and exercises it. Fees: 3% of premium + 0.1% of strike, all to the FeeVault.
  if ((await pub.readContract({ address: pool, abi: ABI.pool, functionName: 'pendingRewards', args: [buyer] })) > 0n) { console.log('[prep] buyer already has WETH to claim; stake prep already done'); return }
  const spot = seeded().spotEth
  const now = BigInt((await pub.getBlock()).timestamp)
  let n = 0
  for (const [sym, token] of Object.entries(TOKENS)) {
    for (let i = 0; i < SEEDERS.length; i++) {
      const seller = SEEDERS[i], buyerS = SEEDERS[(i + 1) % SEEDERS.length]
      const amount = parseEther('40')
      const strikePer = spot[sym] * 1.02
      const strike = parseEther((strikePer * 40).toFixed(12))
      const premium = parseEther((spot[sym] * 40 * 0.02).toFixed(12))
      if ((await pub.readContract({ address: token, abi: ABI.erc20, functionName: 'allowance', args: [seller, V3.callMarket] })) < amount)
        await send(seller, { address: token, abi: ABI.erc20, functionName: 'approve', args: [V3.callMarket, maxUint256] }, `${seller.slice(0, 6)} approves ${sym}`)
      const r = await send(seller, { address: V3.callMarket, abi: ABI.call, functionName: 'createOffer', args: [token, amount, strike, premium, now + 7n * 86400n, now + 86400n] }, `${seller.slice(0, 6)} writes 40 ${sym} call`)
      const id = BigInt(r.logs.find((l) => l.address.toLowerCase() === V3.callMarket.toLowerCase()).topics[1])
      await send(buyerS, { address: V3.router, abi: ABI.router, functionName: 'buyWithETH', args: [id, premium], value: premium }, `${buyerS.slice(0, 6)} buys it`)
      await send(buyerS, { address: V3.router, abi: ABI.router, functionName: 'exerciseWithETH', args: [id], value: strike }, `${buyerS.slice(0, 6)} exercises it`)
      n++
    }
  }
  console.log(`[prep] ${n} trades; FeeVault WETH ${formatEther(await wethOf(vault))}`)
  // 2) Buyer pre-stakes so it is active stake when the split lands (new stake only earns from the next epoch).
  const [active, pending] = await pub.readContract({ address: pool, abi: ABI.pool, functionName: 'balancesOf', args: [buyer] })
  if (active + pending === 0n) {
    await send(buyer, { address: dep.kyteToken, abi: ABI.erc20, functionName: 'approve', args: [pool, maxUint256] }, 'buyer approves KYTE to StakingPool')
    await send(buyer, { address: pool, abi: ABI.pool, functionName: 'stake', args: [parseEther(preStake)] }, `buyer pre-stakes ${preStake} KYTE`)
  }
  // 3) Next epoch: jump chain time past epochEndsAt, mine.
  const ends = await pub.readContract({ address: pool, abi: ABI.pool, functionName: 'epochEndsAt' })
  const ts = BigInt((await pub.getBlock()).timestamp)
  if (ts < ends + 30n) { await rpc('evm_increaseTime', [Number(ends + 30n - ts)]); await rpc('evm_mine', []) }
  console.log(`[prep] chain time now ${new Date(Number((await pub.getBlock()).timestamp) * 1000).toISOString()}`)
  // 4) The keeper's split job, verbatim conditions (keeper/src/index.mjs jobSplit): balance > 0, epoch > lastSplitEpoch.
  const [bal, epoch, last] = await Promise.all([wethOf(vault), pub.readContract({ address: vault, abi: ABI.vault, functionName: 'currentEpoch' }), pub.readContract({ address: vault, abi: ABI.vault, functionName: 'lastSplitEpoch' })])
  if (bal > 0n && epoch > last) await send(buyer, { address: vault, abi: ABI.vault, functionName: 'split' }, `split ${formatEther(bal)} WETH (epoch ${epoch})`)
  await prepBuyback()
  console.log(`[prep] buyer claimable ${formatEther(await pub.readContract({ address: pool, abi: ABI.pool, functionName: 'pendingRewards', args: [buyer] }))} WETH`)
}

/** The keeper's buyback job (keeper-only on chain): impersonate the configured keeper on the fork. */
export async function prepBuyback() {
  try {
    const b = dep.buybackBurner
    const [bb, adapter, maxPer, keeper, paused] = await Promise.all([wethOf(b), pub.readContract({ address: b, abi: ABI.burner, functionName: 'adapter' }), pub.readContract({ address: b, abi: ABI.burner, functionName: 'maxPerCall' }), pub.readContract({ address: b, abi: ABI.burner, functionName: 'keeper' }), pub.readContract({ address: b, abi: ABI.burner, functionName: 'paused' })])
    if (!paused && bb > 0n && adapter !== '0x0000000000000000000000000000000000000000') {
      const amount = bb < maxPer ? bb : maxPer
      const quote = await pub.readContract({ address: adapter, abi: ABI.adapter, functionName: 'quoteWethForToken', args: [amount] })
      await rpc('anvil_impersonateAccount', [keeper])
      await rpc('anvil_setBalance', [keeper, '0x' + parseEther('100').toString(16)])
      const minOut = (quote * 9_700n) / 10_000n
      const deadline = BigInt((await pub.getBlock()).timestamp) + 120n
      await send(keeper, { address: b, abi: ABI.burner, functionName: 'buyAndBurn', args: [amount, minOut, deadline] }, `buyAndBurn ${formatEther(amount)} WETH as keeper ${keeper.slice(0, 6)}`)
      await rpc('anvil_stopImpersonatingAccount', [keeper])
    } else console.log('[prep] buyback skipped', { paused, bb: formatEther(bb), adapter })
  } catch (e) { console.log('[prep] buyback failed (proof page will show splits only):', e.shortMessage || e.message) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const what = process.argv[2]
  if (what === 'settle') await prepSettle()
  else if (what === 'stake') await prepStake()
  else if (what === 'buyback') await prepBuyback()
  else { console.error('usage: node video/record/prep.mjs settle|stake'); process.exit(1) }
}
