import { useEffect, useState } from 'react'
import { continueRender, delayRender, staticFile } from 'remotion'
import type { RecEvent } from './useRecording'

export const SFX = ['click', 'key', 'key2', 'key3', 'hover', 'tick', 'confirm', 'shimmer', 'whoosh', 'swell', 'outro'] as const
export type Sfx = (typeof SFX)[number]
export type Cue = { frame: number; sfx: Sfx; volume?: number }

/** Frames between keystrokes when a type event has no charFrames. */
export const KEY_GAP = 5

/** Cue balance from the lead (film is loudness-normalized afterwards; these only set relative levels). */
export const VOL: Record<Sfx, number> = {
  click: 0.35, key: 0.18, key2: 0.18, key3: 0.18, hover: 0.12, tick: 0.2, confirm: 0.45, shimmer: 0.5, whoosh: 0.4, swell: 0.5, outro: 0.45, // swell/outro pulled down from the brief (0.85/0.75) so loudnorm stays linear under -2 dBTP
}
/** whoosh peaks ~0.25 s in: start it this many frames before the cut */
export const WHOOSH_LEAD = 15
/** swell's hit lands at 2.8 s: start it this many frames before the hit */
export const SWELL_LEAD = 168

/** Sound cues from a recording's events, in recording frames (see SPEC "Sound cues come from"). */
export const cues = (events: RecEvent[]): Cue[] => {
  const out: Cue[] = []
  for (const e of events) {
    if (e.type === 'click') out.push({ frame: e.f, sfx: 'click', volume: VOL.click })
    else if (e.type === 'hover' && (e.dwell ?? 0) >= 30) out.push({ frame: e.f, sfx: 'hover', volume: VOL.hover })
    else if (e.type === 'type') {
      const fs = e.charFrames?.length ? e.charFrames : [...e.text].map((_, i) => e.f + i * KEY_GAP)
      const keys = ['key', 'key2', 'key3'] as const
      // cycle the three key samples; volume 0.15..0.22 with a deterministic wobble per character
      fs.forEach((f, i) => out.push({ frame: f, sfx: keys[i % 3], volume: 0.15 + 0.07 * (((i * 5 + 2) % 7) / 6) }))
    } else if (e.type === 'tx' && e.state === 'confirmed') out.push({ frame: e.f, sfx: 'confirm', volume: VOL.confirm })
    else if (e.type === 'mark' && e.name === 'nft-minted') out.push({ frame: e.f, sfx: 'shimmer', volume: VOL.shimmer })
  }
  return out
}

export const sfxFile = (s: Sfx) => staticFile(`sfx/${s}.wav`)

/** Which public/sfx/*.wav exist (HEAD probe), so missing files are skipped instead of failing the render. */
export const useAvailableSfx = (): Set<Sfx> | undefined => {
  const [got, setGot] = useState<Set<Sfx> | undefined>(undefined)
  const [handle] = useState(() => delayRender('probe sfx'))
  useEffect(() => {
    Promise.all(SFX.map((s) => fetch(sfxFile(s), { method: 'HEAD' }).then((r) => (r.ok ? s : null)).catch(() => null))).then((r) => {
      setGot(new Set(r.filter((x): x is Sfx => !!x)))
      continueRender(handle)
    })
  }, [handle])
  return got
}
