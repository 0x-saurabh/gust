// End-to-end check of every website action against the devnet, using the same contract calls the UI makes.
//   node scripts/e2e-devnet.mjs
import fs from 'node:fs'
import { createPublicClient, createWalletClient, http, parseEther, parseUnits, formatEther, decodeEventLog } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC = 'http://127.0.0.1:8547'
const chain = { id: 31337, name: 'devnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const dep = JSON.parse(fs.readFileSync('contracts/deployments/31337.json', 'utf8'))
const ABIS = JSON.parse(fs.readFileSync('src/lib/generated/abis.ts', 'utf8').replace(/^.*?export const ABIS = /s, '').replace(/ as const\n$/, ''))
const pub = createPublicClient({ chain, transport: http(RPC) })
// anvil #4 (seller) and #5 (buyer)
const seller = privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a')
const buyer = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba')
const w = (acct) => createWalletClient({ account: acct, chain, transport: http(RPC) })
let step = 0
async function tx(acct, label, params) {
  const { request } = await pub.simulateContract({ account: acct, ...params })
  const hash = await w(acct).writeContract(request)
  const r = await pub.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error(`${label} reverted`)
  console.log(`${++step}. ${label} ✓`)
  return r
}
const idFrom = (r, abi) => { for (const l of r.logs) { try { const d = decodeEventLog({ abi, data: l.data, topics: l.topics }); if (d.eventName === 'OfferCreated') return d.args.id } catch {} } }
const erc = (addr) => ({ address: addr, abi: ABIS.ERC20 })

// faucet (what the Faucet button does)
for (const a of [seller, buyer]) {
  await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'anvil_setBalance', params: [a.address, '0x' + (100n * 10n ** 18n).toString(16)] }) })
  await tx(a, `faucet: mint ZEPH to ${a.address.slice(0, 8)}`, { ...erc(dep.tokens.ZEPH), functionName: 'mint', args: [a.address, parseEther('5000000')] })
  await tx(a, `faucet: mint KYTE to ${a.address.slice(0, 8)}`, { ...erc(dep.kyteToken), functionName: 'mint', args: [a.address, parseEther('10000000')] })
}

const now = Number((await pub.getBlock()).timestamp)
// Sell a call (approve + createOffer)
await tx(seller, 'approve ZEPH → CallMarket', { ...erc(dep.tokens.ZEPH), functionName: 'approve', args: [dep.callMarket, parseEther('100000')] })
const callR = await tx(seller, 'createOffer (call) 100k ZEPH, strike 3 ETH, premium 0.1', { address: dep.callMarket, abi: ABIS.CallMarket, functionName: 'createOffer', args: [dep.tokens.ZEPH, parseEther('100000'), parseEther('3'), parseEther('0.1'), BigInt(now + 7 * 86400), BigInt(now + 2 * 86400)] })
const callId = idFrom(callR, ABIS.CallMarket)
// Buy with ETH via router
const b0 = await pub.getBalance({ address: buyer.address })
await tx(buyer, 'router.buyWithETH (sends 0.15, needs 0.1)', { address: dep.router, abi: ABIS.Router, functionName: 'buyWithETH', args: [callId, parseEther('0.1')], value: parseEther('0.15') })
const spent = b0 - (await pub.getBalance({ address: buyer.address }))
if (spent > parseEther('0.101')) throw new Error(`refund failed: spent ${formatEther(spent)}`)
console.log(`   buyer spent ${formatEther(spent)} ETH (premium + gas; excess refunded)`)
// Exercise with ETH via router
const z0 = await pub.readContract({ ...erc(dep.tokens.ZEPH), functionName: 'balanceOf', args: [buyer.address] })
await tx(buyer, 'router.exerciseWithETH (pays 3 ETH)', { address: dep.router, abi: ABIS.Router, functionName: 'exerciseWithETH', args: [callId], value: parseEther('3') })
const got = (await pub.readContract({ ...erc(dep.tokens.ZEPH), functionName: 'balanceOf', args: [buyer.address] })) - z0
if (got !== parseEther('100000')) throw new Error('exercise did not deliver tokens')
console.log('   buyer received 100,000 ZEPH; seller got WETH')

// Put flow: seller locks 2 ETH via router, buyer buys, buyer exercises (approve + exercisePut)
const putR = await tx(seller, 'router.createPutOfferWithETH 50k ZEPH, strike 2 ETH, premium 0.05', { address: dep.router, abi: ABIS.Router, functionName: 'createPutOfferWithETH', args: [dep.tokens.ZEPH, parseEther('50000'), parseEther('2'), parseEther('0.05'), BigInt(now + 5 * 86400), BigInt(now + 2 * 86400)], value: parseEther('2') })
const putId = idFrom(putR, ABIS.PutMarket)
await tx(buyer, 'router.buyPutWithETH', { address: dep.router, abi: ABIS.Router, functionName: 'buyPutWithETH', args: [putId, parseEther('0.05')], value: parseEther('0.05') })
await tx(buyer, 'approve ZEPH → PutMarket', { ...erc(dep.tokens.ZEPH), functionName: 'approve', args: [dep.putMarket, parseEther('50000')] })
const wb0 = await pub.readContract({ ...erc(dep.weth), functionName: 'balanceOf', args: [buyer.address] })
await tx(buyer, 'putMarket.exercisePut (delivers 50k ZEPH)', { address: dep.putMarket, abi: ABIS.PutMarket, functionName: 'exercisePut', args: [putId] })
const wGot = (await pub.readContract({ ...erc(dep.weth), functionName: 'balanceOf', args: [buyer.address] })) - wb0
console.log(`   buyer received ${formatEther(wGot)} WETH (2 − 0.1% fee)`)

// Unwrap WETH → ETH
await tx(buyer, `weth.withdraw ${formatEther(wGot)}`, { address: dep.weth, abi: ABIS.WETH, functionName: 'withdraw', args: [wGot] })

// Stake / unstake / claim
await tx(seller, 'approve KYTE → StakingPool', { ...erc(dep.kyteToken), functionName: 'approve', args: [dep.stakingPool, parseEther('1000000')] })
await tx(seller, 'stakingPool.stake 1M', { address: dep.stakingPool, abi: ABIS.StakingPool, functionName: 'stake', args: [parseEther('1000000')] })
await tx(seller, 'stakingPool.unstake 250k', { address: dep.stakingPool, abi: ABIS.StakingPool, functionName: 'unstake', args: [parseEther('250000')] })
const [act, pend] = await pub.readContract({ address: dep.stakingPool, abi: ABIS.StakingPool, functionName: 'balancesOf', args: [seller.address] })
console.log(`   seller stake: active ${formatEther(act)}, pending ${formatEther(pend)}`)

// Cancel an unfilled offer
await tx(seller, 'approve ZEPH → CallMarket', { ...erc(dep.tokens.ZEPH), functionName: 'approve', args: [dep.callMarket, parseEther('1000')] })
const cR = await tx(seller, 'createOffer (to cancel)', { address: dep.callMarket, abi: ABIS.CallMarket, functionName: 'createOffer', args: [dep.tokens.ZEPH, parseEther('1000'), parseEther('0.5'), parseEther('0.01'), BigInt(now + 86400), BigInt(now + 3600)] })
await tx(seller, 'callMarket.cancelUnfilled', { address: dep.callMarket, abi: ABIS.CallMarket, functionName: 'cancelUnfilled', args: [idFrom(cR, ABIS.CallMarket)] })

// Indexer agreement
await new Promise((r) => setTimeout(r, 5000))
const all = await (await fetch('http://localhost:4200/offers?status=all')).json()
const byId = Object.fromEntries(all.map((o) => [o.id, o.status]))
const want = { [callId]: 'exercised', [putId]: 'exercised' }
for (const [id, st] of Object.entries(want)) if (byId[id] !== st) throw new Error(`indexer: ${id} is ${byId[id]}, want ${st}`)
const pos = await (await fetch(`http://localhost:4200/positions/${seller.address}`)).json()
console.log(`   indexer: call ${byId[callId]}, put ${byId[putId]}; seller history ${pos.history.length}, selling ${pos.selling.length}`)
const stats = await (await fetch('http://localhost:4200/stats')).json()
console.log('   stats:', JSON.stringify(stats))
console.log('ALL OK')
