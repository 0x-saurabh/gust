// Builds the Oak Agent Kit recipe package for Kyte (oak-recipe/v1) from the mainnet deployments and the
// committed ABIs, so an Oak-powered agent can trade Kyte options and stake $KYTE from its own wallet.
//   node scripts/oak/build-recipes.mjs          writes scripts/oak/kyte-oak-recipes/recipes/*.recipe.json
// Spec: https://github.com/OakAgentKit/oak/blob/main/CONTRIBUTING.md (section 2). Users opt in with
//   oak recipes add kyte-oak-recipes
import fs from 'node:fs'
import path from 'node:path'
import { getAddress } from 'viem'

const root = path.resolve(import.meta.dirname, '../..')
const dep = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/generated/deployments.json'), 'utf8'))['4663']
const abi = (name) => JSON.parse(fs.readFileSync(path.join(root, 'indexer/abis', `${name}.json`), 'utf8')).abi
const fn = (list, name) => {
  const e = list.find((x) => x.type === 'function' && x.name === name)
  if (!e) throw new Error(`ABI entry ${name} missing`)
  return { type: 'function', name: e.name, stateMutability: e.stateMutability, inputs: e.inputs, outputs: e.outputs }
}
const addr = (a) => getAddress(a)

// Current market set (newest). Older sets still settle their own positions through kyte.sh.
const markets = { ...dep, ...dep.v2, ...dep.v3 }
const CALL = addr(markets.callMarket), PUT = addr(markets.putMarket), ROUTER = addr(markets.router)
const REGISTRY = addr(markets.assetRegistry), STAKING = addr(dep.stakingPool), KYTE = addr(dep.kyteToken), WETH = addr(dep.weth)

const callAbi = abi('CallMarket'), putAbi = abi('PutMarket'), stakeAbi = abi('StakingPool'), regAbi = abi('AssetRegistry')
const u256 = (name) => ({ name, type: 'uint256' })
const routerFn = (name, inputs) => ({ type: 'function', name, stateMutability: 'payable', inputs, outputs: [] })
const offerInputs = [{ name: 'token', type: 'address' }, u256('amount'), u256('strike'), u256('premium'), { name: 'expiry', type: 'uint64' }, { name: 'offerDeadline', type: 'uint64' }]

const ID = { name: 'id', type: 'uint256', description: 'Option id (the OptionNFT token id). Read it from kyte.sh/market, the Kyte MCP (find_offers, get_positions) or the OfferCreated event.' }
const offerDesc = (collateral) => [
  { name: 'token', type: 'address', description: 'Listed token address (AssetRegistry.getAsset must return listed and enabled).' },
  { name: 'amount', type: 'uint256', description: `Tokens in base units (token decimals). ${collateral}` },
  { name: 'strike', type: 'uint256', description: 'Total strike for the whole amount, in wei of ETH (not per token). Must be at least minStrike per token.' },
  { name: 'premium', type: 'uint256', description: 'Premium the buyer pays, in wei of ETH. Minimum 0.0005 ETH; a 3% fee is taken from it when filled.' },
  { name: 'expiry', type: 'uint64', description: 'Unix timestamp when the option expires; 1 hour to 90 days from now (24 hours max for Pons launchpad tokens).' },
  { name: 'offerDeadline', type: 'uint64', description: 'Unix timestamp until which the offer can be bought; at most expiry.' },
]

const recipes = [
  // ---- Read
  { name: 'get-call', description: 'Read a call option: seller, token, amount, total strike (wei), premium (wei), expiry, fill deadline and status (0 Open, 1 Filled, 2 Cancelled, 3 Exercised, 4 Expired).', contract: CALL, function: fn(callAbi, 'getPosition'), inputs: [ID], kind: 'read' },
  { name: 'get-put', description: 'Read a put option: seller, token, amount, total strike (wei), premium (wei), expiry, fill deadline and status (0 Open, 1 Filled, 2 Cancelled, 3 Exercised, 4 Expired).', contract: PUT, function: fn(putAbi, 'getPosition'), inputs: [ID], kind: 'read' },
  { name: 'get-asset', description: 'Read a token\'s Kyte listing: listed, enabled, putsEnabled, decimals, exposure cap (base units) and minimum strike per token (wei).', contract: REGISTRY, function: fn(regAbi, 'getAsset'), inputs: [{ name: 'token', type: 'address', description: 'ERC-20 token address on Robinhood Chain.' }], kind: 'read' },
  { name: 'listed-token', description: 'Read the listed token at an index; use with asset-count to enumerate every token Kyte lists.', contract: REGISTRY, function: fn(regAbi, 'listedTokens'), inputs: [{ name: 'index', type: 'uint256', description: 'Zero-based index below asset-count.' }], kind: 'read' },
  { name: 'asset-count', description: 'Number of tokens ever listed on Kyte.', contract: REGISTRY, function: fn(regAbi, 'assetCount'), inputs: [], kind: 'read' },
  { name: 'staking-balances', description: 'Read a wallet\'s staked $KYTE: active (earning) and pending (activates at the next epoch), in base units (18 decimals).', contract: STAKING, function: fn(stakeAbi, 'balancesOf'), inputs: [{ name: 'user', type: 'address', description: 'Wallet address.' }], kind: 'read' },
  { name: 'staking-rewards', description: 'Read a wallet\'s claimable WETH staking rewards in wei.', contract: STAKING, function: fn(stakeAbi, 'pendingRewards'), inputs: [{ name: 'user', type: 'address', description: 'Wallet address.' }], kind: 'read' },

  // ---- Buy (pay in ETH through the Router; it wraps the premium and refunds the excess)
  { name: 'buy-call', description: 'Buy an open call option with ETH: pay its premium and receive the OptionNFT giving the right to buy the tokens at the strike until expiry. Send maxPremium as value; the Router refunds any excess.', contract: ROUTER, function: routerFn('buyWithETH', [u256('id'), u256('maxPremium')]), inputs: [ID, { name: 'maxPremium', type: 'uint256', description: 'Most you will pay in wei; the offer\'s premium or slightly above. Also sent as the transaction value.' }], kind: 'tx', value: { fromInput: 'maxPremium' } },
  { name: 'buy-put', description: 'Buy an open put option with ETH: pay its premium and receive the OptionNFT giving the right to sell the tokens at the strike until expiry. Send maxPremium as value; the Router refunds any excess.', contract: ROUTER, function: routerFn('buyPutWithETH', [u256('id'), u256('maxPremium')]), inputs: [ID, { name: 'maxPremium', type: 'uint256', description: 'Most you will pay in wei; the offer\'s premium or slightly above. Also sent as the transaction value.' }], kind: 'tx', value: { fromInput: 'maxPremium' } },

  // ---- Sell
  { name: 'sell-covered-call', description: 'List a covered call: lock amount of token as collateral and offer the right to buy it for strike until expiry. Approve the CallMarket for amount of token first (approve is only automatic in the per-token variants sell-covered-call-pons and sell-covered-call-kyte). Returns the option id.', contract: CALL, function: fn(callAbi, 'createOffer'), inputs: offerDesc('Locked in the CallMarket until filled-and-exercised, cancelled or expired.'), kind: 'tx' },
  { name: 'sell-covered-call-pons', description: 'List a covered call on PONS with the token approval handled: lock amount of PONS and offer the right to buy it for strike until expiry (max 24 hours). Returns the option id.', contract: CALL, function: fn(callAbi, 'createOffer'), inputs: offerDesc('PONS is 18 decimals.').map((i) => i.name === 'token' ? { ...i, description: 'Must be the PONS token address.', default: addr(dep.tokens.PONS) } : i), kind: 'tx', approve: { token: addr(dep.tokens.PONS), amountFromInput: 'amount' } },
  { name: 'sell-covered-call-kyte', description: 'List a covered call on $KYTE with the token approval handled: lock amount of KYTE and offer the right to buy it for strike until expiry. Returns the option id.', contract: CALL, function: fn(callAbi, 'createOffer'), inputs: offerDesc('KYTE is 18 decimals.').map((i) => i.name === 'token' ? { ...i, description: 'Must be the KYTE token address.', default: KYTE } : i), kind: 'tx', approve: { token: KYTE, amountFromInput: 'amount' } },
  { name: 'sell-cash-secured-put', description: 'List a cash-secured put with ETH: the Router wraps strike wei of ETH as the collateral and offers the right to sell amount of token to you for it until expiry. Only tokens with putsEnabled. Send strike as value. Returns the option id.', contract: ROUTER, function: { ...routerFn('createPutOfferWithETH', offerInputs), outputs: [{ name: 'id', type: 'uint256' }] }, inputs: offerDesc('The token must have puts enabled (get-asset.putsEnabled).').map((i) => i.name === 'strike' ? { ...i, description: 'Total strike for the whole amount, in wei of ETH; locked as WETH collateral and also sent as the transaction value.' } : i), kind: 'tx', value: { fromInput: 'strike' } },

  // ---- Settle
  { name: 'exercise-call', description: 'Exercise a filled call you hold before expiry: pay the total strike plus the 0.1% exercise fee in WETH and receive the tokens. Approve the CallMarket for strike * 1.001 WETH first, or exercise with ETH on kyte.sh/positions.', contract: CALL, function: fn(callAbi, 'exercise'), inputs: [ID], kind: 'tx' },
  { name: 'exercise-put', description: 'Exercise a filled put you hold before expiry: deliver the tokens and receive the strike in WETH minus the 0.1% fee. Approve the PutMarket for amount of the token first.', contract: PUT, function: fn(putAbi, 'exercisePut'), inputs: [ID], kind: 'tx' },
  { name: 'cancel-call', description: 'Cancel your own open (unfilled) call offer and take the token collateral back.', contract: CALL, function: fn(callAbi, 'cancelUnfilled'), inputs: [ID], kind: 'tx' },
  { name: 'cancel-put', description: 'Cancel your own open (unfilled) put offer and take the WETH collateral back.', contract: PUT, function: fn(putAbi, 'cancelUnfilled'), inputs: [ID], kind: 'tx' },
  { name: 'expire-call', description: 'After expiry, return a call\'s unexercised token collateral to its seller. Anyone can call it.', contract: CALL, function: fn(callAbi, 'expire'), inputs: [ID], kind: 'tx' },
  { name: 'expire-put', description: 'After expiry, return a put\'s unexercised WETH collateral to its seller. Anyone can call it.', contract: PUT, function: fn(putAbi, 'expire'), inputs: [ID], kind: 'tx' },

  // ---- Stake
  { name: 'stake', description: 'Stake $KYTE (approval handled). Pending until the current epoch ends, then active, locked for one epoch, and earning a share of protocol fees in WETH.', contract: STAKING, function: fn(stakeAbi, 'stake'), inputs: [{ name: 'amount', type: 'uint256', description: 'KYTE base units (18 decimals).' }], kind: 'tx', approve: { token: KYTE, amountFromInput: 'amount' } },
  { name: 'unstake', description: 'Unstake $KYTE. Pending stake leaves at once; active stake must be past its lock epoch.', contract: STAKING, function: fn(stakeAbi, 'unstake'), inputs: [{ name: 'amount', type: 'uint256', description: 'KYTE base units (18 decimals).' }], kind: 'tx' },
  { name: 'claim-rewards', description: 'Claim your accrued WETH staking rewards.', contract: STAKING, function: fn(stakeAbi, 'claim'), inputs: [], kind: 'tx' },
  { name: 'unwrap-weth', description: 'Unwrap WETH to ETH. Premiums, strikes and staking rewards arrive as WETH.', contract: WETH, function: { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [u256('wad')], outputs: [] }, inputs: [{ name: 'wad', type: 'uint256', description: 'WETH amount in wei.' }], kind: 'tx' },
]

const out = path.join(import.meta.dirname, 'kyte-oak-recipes/recipes')
fs.mkdirSync(out, { recursive: true })
for (const f of fs.readdirSync(out)) if (f.endsWith('.recipe.json')) fs.unlinkSync(path.join(out, f))
for (const r of recipes) {
  const body = { schema: 'oak-recipe/v1', project: 'kyte', name: r.name, description: r.description, chainId: 4663, contract: r.contract, function: r.function, inputs: r.inputs, kind: r.kind, ...(r.value ? { value: r.value } : {}), ...(r.approve ? { approve: r.approve } : {}) }
  for (const [i, inp] of body.inputs.entries()) {
    const f = body.function.inputs[i]
    if (!f || f.type !== inp.type) throw new Error(`${r.name}: input ${inp.name} does not match the ABI`)
  }
  fs.writeFileSync(path.join(out, `${r.name}.recipe.json`), JSON.stringify(body, null, 2) + '\n')
}
console.log(`${recipes.length} recipes written to ${path.relative(root, out)}/ (call ${CALL}, put ${PUT}, router ${ROUTER})`)
