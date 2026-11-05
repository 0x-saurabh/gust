import { hash, type Pt } from './motion'

/** Smooth seeded "price" curve, sampled densely (Catmull-Rom). Pure and deterministic. */
export const priceCurve = (opts: { x0: number; x1: number; base: number; amp: number; rise: number; knots?: number; seed?: number; samples?: number }): Pt[] => {
  const { x0, x1, base, amp, rise, knots = 11, seed = 7, samples = 24 } = opts
  const k: Pt[] = []
  for (let i = 0; i < knots; i++) {
    const u = i / (knots - 1)
    const n = (hash(seed + i * 3.17) - 0.5) * 2
    // gentle up-trend with a dip before the final run
    const trend = -rise * Math.pow(u, 1.6)
    const dip = 0.45 * amp * Math.exp(-Math.pow((u - 0.62) / 0.1, 2))
    k.push({ x: x0 + (x1 - x0) * u, y: base + trend + n * amp * (i === 0 || i === knots - 1 ? 0.2 : 1) + dip })
  }
  const pts: Pt[] = []
  for (let i = 0; i < k.length - 1; i++) {
    const p0 = k[Math.max(0, i - 1)], p1 = k[i], p2 = k[i + 1], p3 = k[Math.min(k.length - 1, i + 2)]
    for (let s = 0; s < samples; s++) {
      const t = s / samples, t2 = t * t, t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      pts.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) })
    }
  }
  pts.push(k[k.length - 1])
  return pts
}

export const cumLengths = (pts: Pt[]) => {
  const L = [0]
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  return L
}

/** Point at arc-length fraction u (0..1) plus the index of the segment. */
export const pointAt = (pts: Pt[], L: number[], u: number): { p: Pt; i: number } => {
  const target = Math.min(1, Math.max(0, u)) * L[L.length - 1]
  let i = 1
  while (i < L.length - 1 && L[i] < target) i++
  const a = pts[i - 1], b = pts[i]
  const seg = L[i] - L[i - 1] || 1
  const f = (target - L[i - 1]) / seg
  return { p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, i }
}

export const polyD = (pts: Pt[], dy = 0) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${(p.y + dy).toFixed(1)}`).join(' ')
