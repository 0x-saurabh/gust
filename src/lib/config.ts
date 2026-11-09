// Brand and protocol parameters.
export const BRAND = {
  name: 'Kyte',
  wordmark: 'kyte.sh',
  token: '$KYTE',
  /** Where to buy $KYTE: the Pons launchpad page for the token. */
  tradeUrl: 'https://ponsfamily.com/launchpad/0x072d88c2f31f568c0f4b8f613692eb489541ed45',
  tagline: 'Covered options on Robinhood Chain',
} as const

// Launch values from SPEC.md §7.1. The contracts snapshot these per position.
export const FEES = {
  premiumBps: 300, // 3% of the premium
  exerciseBps: 10, // 0.1% of the strike
} as const

export const SPLIT = {
  stakersBps: 3000,
  buybackBps: 2000,
  opsBps: 5000,
} as const

export const LIMITS = {
  minDurationSec: 60 * 60, // 1 hour
  maxDurationSec: 90 * 24 * 60 * 60, // 90 days
  minPremiumEth: 0.0005,
  epochSec: 24 * 60 * 60,
} as const

export const DEMO = process.env.NEXT_PUBLIC_DEMO !== '0'

/** Privy app id. Wallet picker shows only wallets installed in the browser (see components/Providers.tsx). */
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''

/** MCP (connector endpoint + /mcp page). Off in production until it is published; on everywhere else, e.g. local dev. */
export const MCP_ENABLED = process.env.NEXT_PUBLIC_MCP_ENABLED !== 'false'
/** Autopilot (page, nav, agent tools, rule routes). Off in production until launch; on locally. */
export const AUTOPILOT_ENABLED = process.env.NEXT_PUBLIC_AUTOPILOT_ENABLED !== 'false'
/** Launchpad (Pons graduations page, nav link, list_graduated tool). Off in production until launch; on locally. */
export const LAUNCHPAD_ENABLED = process.env.NEXT_PUBLIC_LAUNCHPAD_ENABLED !== 'false'
/** USDG rewards (page, nav link, get_rewards tool). On unless NEXT_PUBLIC_REWARDS_ENABLED=false. */
export const REWARDS_ENABLED = process.env.NEXT_PUBLIC_REWARDS_ENABLED !== 'false'
/** Daily USDG staker share card on /stake and in get_staking (docs/STAKER_USDG_SHARE.md). On unless NEXT_PUBLIC_STAKER_SHARE_ENABLED=false. */
export const STAKER_SHARE_ENABLED = process.env.NEXT_PUBLIC_STAKER_SHARE_ENABLED !== 'false'
/** USDG on Robinhood Chain (Paxos Global Dollar, 6 decimals): the rewards token. */
export const USDG = { address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', decimals: 6, symbol: 'USDG' } as const
