export const W = 1920
export const H = 1080
export const FPS = 60

export const C = {
  bg: '#000000', card: '#181818', border: '#272727', ink: '#ffffff', muted: '#9b9b9b',
  mint: '#4dfca9', cyan: '#05edfa', warn: '#ffd166', danger: '#ff6b6b',
  hero: ['#7cff8e', '#5cffc4', '#4af0ff'] as const,
  grad: ['#6eff85', '#4affec'] as const,
}

/** cubic-bezier(0.16,1,0.3,1) as a function of t in [0,1]. */
export const easeOut = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  // Newton solve for the bezier's x(u) = t, then return y(u).
  const cx = 3 * 0.16, bx = 3 * (0.3 - 0.16) - cx, ax = 1 - cx - bx
  const cy = 3 * 1, by = 3 * (1 - 1) - cy, ay = 1 - cy - by
  let u = x
  for (let i = 0; i < 8; i++) {
    const fx = ((ax * u + bx) * u + cx) * u - x
    const d = (3 * ax * u + 2 * bx) * u + cx
    if (Math.abs(d) < 1e-6) break
    u -= fx / d
  }
  return ((ay * u + by) * u + cy) * u
}

/** Critically damped spring progress, 0 -> 1, t in seconds. */
export const spring01 = (t: number, w = 14) => (t <= 0 ? 0 : 1 - (1 + w * t) * Math.exp(-w * t))

/** Scene lengths in seconds; see video/SPEC.md. */
export const SCENES = [
  { id: 'welcome', len: 7 }, { id: 'landing', len: 8 }, { id: 'how', len: 9 }, { id: 'stock', len: 14 },
  { id: 'sell', len: 14 }, { id: 'buy', len: 12 }, { id: 'settle', len: 10 }, { id: 'stake', len: 9 }, { id: 'outro', len: 7 },
] as const
