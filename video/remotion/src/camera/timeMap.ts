/**
 * Scene-time <-> recording-time mapping. Actions are never retimed: the liberties are trimming, jump cuts
 * between segments, freezing the recording at idle moments (holds), and speeding through idle stretches.
 *
 * A map is a list of pieces played back to back: { rec, len, rate } shows recording frames
 * rec, rec + rate, rec + 2*rate … for len scene frames (rate 0 = freeze on rec).
 */
export type Hold = { /** recording frame to freeze on */ at: number; /** scene frames to hold it */ frames: number }
export type Seg =
  | { /** recording frames [from, to) */ from: number; to: number; /** playback rate, 1 = real time; >1 only on idle stretches */ rate?: number }
  | { hold: number; frames: number }
export type Piece = { rec: number; len: number; rate: number }
export type TimeMap = { pieces: Piece[]; tailRate: number }

export const segLen = (s: Seg) => ('hold' in s ? s.frames : Math.round((s.to - s.from) / (s.rate ?? 1)))
export const segsLen = (segs: Seg[]) => segs.reduce((a, s) => a + segLen(s), 0)

/** Build a map from explicit segments, or from (startFrom, holds, rate). */
export const timeMap = (startFrom = 0, holds: Hold[] = [], rate = 1, segments?: Seg[]): TimeMap => {
  if (segments?.length) {
    const pieces = segments.map((s): Piece => ('hold' in s ? { rec: s.hold, len: s.frames, rate: 0 } : { rec: s.from, len: segLen(s), rate: s.rate ?? 1 }))
    return { pieces, tailRate: 1 }
  }
  const pieces: Piece[] = []
  let cur = startFrom
  for (const h of holds.filter((h) => h.at >= startFrom).sort((a, b) => a.at - b.at)) {
    if (h.at > cur) pieces.push({ rec: cur, len: (h.at - cur) / rate, rate })
    pieces.push({ rec: h.at, len: h.frames, rate: 0 })
    cur = h.at
  }
  pieces.push({ rec: cur, len: Infinity, rate })
  return { pieces, tailRate: rate }
}

/** Scene frame -> recording frame (fractional). Past the last piece the recording keeps playing. */
export const toRec = (m: TimeMap, seq: number) => {
  let left = seq
  for (const p of m.pieces) {
    if (left < p.len) return p.rec + left * p.rate
    left -= p.len
  }
  const last = m.pieces[m.pieces.length - 1]
  return last.rec + last.len * last.rate + left * m.tailRate
}

/** Recording frame -> the first scene frame showing it, or -1 if it was cut out. */
export const toScene = (m: TimeMap, rec: number) => {
  let seq = 0
  for (const p of m.pieces) {
    if (p.rate === 0) { if (Math.abs(rec - p.rec) < 0.5) return seq }
    else if (rec >= p.rec && rec < p.rec + p.len * p.rate) return seq + (rec - p.rec) / p.rate
    seq += p.len
  }
  return -1
}

/** Scene frames where a jump cut happens (piece boundaries), for QA and sound. */
export const cutFrames = (m: TimeMap) => {
  const out: number[] = []
  let seq = 0
  for (let i = 0; i < m.pieces.length - 1; i++) {
    seq += m.pieces[i].len
    const a = m.pieces[i], b = m.pieces[i + 1]
    if (Math.abs(a.rec + a.len * a.rate - b.rec) > 1.5) out.push(seq)
  }
  return out
}
