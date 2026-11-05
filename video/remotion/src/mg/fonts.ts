import { loadFont as loadInterTight } from '@remotion/google-fonts/InterTight'
import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk'
import { loadFont as loadGeist } from '@remotion/google-fonts/Geist'
import { loadFont as loadGeistMono } from '@remotion/google-fonts/GeistMono'

const hero = loadInterTight('normal', { weights: ['300', '400'], subsets: ['latin'] }).fontFamily
const display = loadSpaceGrotesk('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily
const body = loadGeist('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily
const mono = loadGeistMono('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily

/** Font stacks for the film. Numbers use `mono` with tabular numerals (see `NUM`). */
export const F = {
  hero: `${hero}, sans-serif`,
  display: `${display}, sans-serif`,
  body: `${body}, sans-serif`,
  mono: `${mono}, ui-monospace, monospace`,
}

/** Style for numbers: tabular numerals. */
export const NUM = { fontVariantNumeric: 'tabular-nums' as const, fontFeatureSettings: '"tnum" 1' }

/** Mono uppercase eyebrow label style (0.08em tracking). */
export const EYEBROW = { fontFamily: F.mono, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }
