import { defineChain, type Address, type Chain } from 'viem'
import { robinhood, robinhoodTestnet } from 'viem/chains'
import deployments from './generated/deployments.json'

// Official endpoints from https://docs.robinhood.com/chain/connecting.
const OFFICIAL_RPC: Record<number, string> = {
  4663: 'https://rpc.mainnet.chain.robinhood.com',
  46630: 'https://rpc.testnet.chain.robinhood.com',
}

/** Local anvil devnet (`contracts/script/DeployDevnet.s.sol`). Port 8547: 8545 is used by another project. */
export const kyteDevnet = defineChain({
  id: 31337,
  name: 'Kyte Devnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8547'] } },
  testnet: true,
})

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 4663)

function withRpc(base: Chain): Chain {
  const rpc = process.env.NEXT_PUBLIC_RPC_URL || OFFICIAL_RPC[base.id] || base.rpcUrls.default.http[0]
  return { ...base, rpcUrls: { default: { http: [rpc] } } }
}

export const chain: Chain = withRpc(CHAIN_ID === 4663 ? robinhood : CHAIN_ID === 31337 ? kyteDevnet : robinhoodTestnet)
export const isDevnet = chain.id === 31337

export function explorerTx(hash: string): string | undefined {
  const url = chain.blockExplorers?.default.url
  return url ? `${url}/tx/${hash}` : undefined
}

export function explorerAddress(address: string): string | undefined {
  const url = chain.blockExplorers?.default.url
  return url ? `${url}/address/${address}` : undefined
}

export type ProtocolContracts = {
  weth?: Address
  callMarket?: Address
  putMarket?: Address
  optionNft?: Address
  assetRegistry?: Address
  feeVault?: Address
  stakingPool?: Address
  buybackBurner?: Address
  router?: Address
  kyteToken?: Address
  opsSafe?: Address
  uniswapV4PoolManager?: Address
  uniswapV4SwapRouter?: Address
  kyteHook?: Address
  swapAdapter?: Address
  tokens?: Record<string, Address>
  /** Block the protocol was deployed at; chain log reads start here. */
  deployBlock?: number
  /** Markets v2: registry with room for every Robinhood Stock Token, plus new NFT, markets and router. */
  v2?: Pick<ProtocolContracts, 'assetRegistry' | 'optionNft' | 'callMarket' | 'putMarket' | 'router'> & { fromBlock?: number }
}

export type MarketSet = Required<Pick<ProtocolContracts, 'assetRegistry' | 'optionNft' | 'callMarket' | 'putMarket' | 'router'>>

// External addresses verified for Robinhood Chain (BUILD_PLAN.md §5). Our own contracts come from
// contracts/deployments/<chainId>.json via `node scripts/sync-contracts.mjs`.
const EXTERNAL: Record<number, ProtocolContracts> = {
  4663: { weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' },
  46630: {},
  31337: {},
}

const deployed = (deployments as Record<string, ProtocolContracts>)[String(CHAIN_ID)] ?? {}
const pickMarkets = (c: ProtocolContracts) =>
  ({ assetRegistry: c.assetRegistry!, optionNft: c.optionNft!, callMarket: c.callMarket!, putMarket: c.putMarket!, router: c.router! }) as MarketSet
/** v1 markets: still settle (buy, exercise, cancel, expire) every position they hold after v2 goes live. */
export const legacyMarkets: MarketSet | null = deployed.v2?.callMarket ? pickMarkets(deployed) : null
/** `contracts.callMarket` etc. are the current markets (v2 once deployed): new offers and listings go there. */
export const contracts: ProtocolContracts = { ...EXTERNAL[CHAIN_ID], ...deployed, ...(deployed.v2?.callMarket ? deployed.v2 : {}) }
/** The market set a position lives in, from its id: v1 ids carry tags 1/2, v2 ids 3/4 (`id >> 248`). */
export function marketsFor(id: bigint): MarketSet {
  return legacyMarkets && id >> 248n < 3n ? legacyMarkets : pickMarkets(contracts)
}
export const contractsLive = Boolean(contracts.callMarket && contracts.putMarket && contracts.weth)
export const DEPLOY_BLOCK = BigInt(contracts.deployBlock ?? 0)

/** Listed tokens known to the site: symbol → address. */
export const TOKENS: Record<string, Address> = contracts.tokens ?? {}
