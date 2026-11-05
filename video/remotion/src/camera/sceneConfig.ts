import { FPS, SCENES } from '../theme'
import type { RecordedSceneProps } from './RecordedScene'
import type { Rect } from './useRecording'

export type SceneId = (typeof SCENES)[number]['id']
export const RECORDED = ['landing', 'how', 'stock', 'sell', 'buy', 'settle', 'stake'] as const
export type RecordedId = (typeof RECORDED)[number]

/** Film timeline: [start, end) in film frames per scene, from the SPEC table. */
export const TIMELINE = (() => {
  let t = 0
  return SCENES.map((s) => { const from = t; t += Math.round(s.len * FPS); return { id: s.id as SceneId, from, dur: t - from } })
})()
export const slot = (id: SceneId) => TIMELINE.find((s) => s.id === id)!

/** Frames the landing scene starts under Welcome's exit (match cut through the rising price line). */
export const LANDING_PRE = 36

const LIST: Rect = { x: 425.3, y: 264, w: 298.7, h: 390 } // stock: TokenPicker ROBINHOOD STOCKS list

/**
 * Per-scene edit lists and camera tuning (recording frames). Each scene's segments add up to its slot
 * (landing: slot + LANDING_PRE, since it starts under Welcome's exit). Actions play at 1x; only the
 * stock list scroll is sped up. Jump cuts sit between actions.
 * camera.byLabel: number = forced zoom for that label, null = ignore events with that label.
 */
export const SCENE_CFG: Record<RecordedId, Omit<RecordedSceneProps, 'id'>> = {
  // hero push, hover Start trading (zoom), scroll to "Real tokens. Real offers.", trending rows, Open offers · live
  landing: {
    segments: [{ from: 96, to: 400 }, { from: 505, to: 620 }, { from: 735, to: 832 }],
    camera: {},
  },
  // FlowStory: Lock (#1), Fill (#2 buyer pays), Settle (#3 exercise), Split (#5 fees); Expire (#4) dropped
  how: {
    segments: [{ from: 20, to: 155 }, { from: 290, to: 425 }, { from: 506, to: 641 }, { from: 950, to: 1085 }],
    // scroll-only scene: push in on the FlowStory (diagram + step card) and keep it there; no cursor
    camera: { extra: [{ start: 0, end: 1105, rect: { x: 380, y: 260, w: 1160, h: 560 }, zoom: 1.45, source: 'manual', label: 'FlowStory' }] },
    cursor: false,
  },
  // picker opens, the list holds at 2.5x from the click to the NVDA pick (scroll sped up 3x), 5m tab, chart
  stock: {
    segments: [{ from: 70, to: 245 }, { from: 245, to: 470, rate: 3 }, { from: 470, to: 800 }, { from: 940, to: 1060 }, { from: 1150, to: 1290 }],
    camera: {
      maxZoom: 2.5, scrollReleases: false,
      byLabel: { TokenPicker: null, 'ROBINHOOD STOCKS list': null, 'AAPL row': null, 'TSLA row': null, search: null, 'NV results': null, 'NVDA row': null, '5m tab': 2 },
      extra: [{ start: 92, end: 772, rect: LIST, zoom: 2.5, source: 'manual', label: 'picker list' }],
    },
  },
  // connect + address, covered call / NVDA, amount + strike, premium hint + submit, pending -> Confirmed + callout
  sell: {
    segments: [{ from: 80, to: 200 }, { from: 220, to: 420 }, { from: 455, to: 620 }, { from: 730, to: 890 }, { from: 1040, to: 1235 }],
    camera: {},
  },
  // offer row, Buy, BuyDialog rows, Buy for 0.0022 ETH -> Confirmed -> NFT card flies to Positions
  buy: {
    segments: [{ from: 160, to: 460 }, { from: 500, to: 586 }, { from: 640, to: 974 }],
    // short look at the Confirmed toast, then back to 1.0 so the NFT can fly into the nav's Positions link
    camera: { byLabel: { 'TxStatus toast': null }, extra: [{ start: 745, end: 790, rect: { x: 1580, y: 962.7, w: 320, h: 97.3 }, zoom: 2, source: 'manual', label: 'buy toast' }] },
  },
  // Holding row, Exercise -> Confirmed (token flow, held), balances, Unwrap WETH -> ETH -> Confirmed
  settle: {
    segments: [{ from: 160, to: 434 }, { hold: 433, frames: 50 }, { from: 466, to: 742 }],
    // the Exercise confirm stays wide so the token flow reads over the page; after the Unwrap confirm the camera
    // frames the balances card (ETH updated, WETH 0) instead of the toast, so the footer never fills the frame
    camera: { byLabel: { 'TxStatus toast': null, 'ETH / WETH balances': 1.5 }, extra: [{ start: 378, end: 470, rect: { x: 0, y: 0, w: 1920, h: 864 }, zoom: 1.25, source: 'manual', label: 'wide for token flow (top of page, footer mostly out)' }, { start: 690, end: 760, rect: { x: 408, y: 150, w: 1104, h: 200 }, zoom: 1.6, source: 'manual', label: 'balances after unwrap' }] },
  },
  // stake 1,000 -> Confirmed, Claim WETH -> Confirmed, flood cut to /proof headline
  stake: {
    segments: [{ from: 100, to: 335 }, { from: 500, to: 625 }, { from: 754, to: 934 }],
    camera: { byLabel: { 'Your position · Claimable': null, Claimable: null } },
  },
}

/** stake: scene frame of the flood cut to /proof (end of the second segment). */
export const STAKE_PROOF_CUT = 235 + 125
