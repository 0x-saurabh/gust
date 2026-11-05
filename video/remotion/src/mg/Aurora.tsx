import React from 'react'
import { AbsoluteFill, Img, staticFile } from 'remotion'
import { clamp01, lerp } from './motion'

/**
 * Frame-driven aurora in the hero gradient. `bloom` 0..1 opens it from black with a soft radial
 * reveal; `t` is time in seconds (drives slow drift / breathing). Pure function of its props.
 */
export const Aurora: React.FC<{ t: number; bloom: number; dim?: number; origin?: { x: number; y: number } }> = ({ t, bloom, dim = 0.5, origin = { x: 62, y: 42 } }) => {
  const b = clamp01(bloom)
  // soft radial reveal radius (in % of the frame diagonal-ish)
  const r0 = lerp(-20, 130, b)
  const mask = `radial-gradient(ellipse 120% 105% at ${origin.x}% ${origin.y}%, #000 ${Math.max(0, r0 - 38)}%, transparent ${r0}%)`
  const breathe = 1 + 0.025 * Math.sin((t / 8) * Math.PI * 2)
  const blobs = [
    { c: '92,255,196', x: 74 + 7 * Math.cos(t * 0.31), y: 8 + 6 * Math.sin(t * 0.41), s: 34, a: 0.28 },
    { c: '74,240,255', x: 66 + 5 * Math.sin(t * 0.23 + 1), y: 96 + 4 * Math.cos(t * 0.33), s: 30, a: 0.26 },
  ]
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ WebkitMaskImage: mask, maskImage: mask, opacity: lerp(0.0, 1, Math.pow(b, 0.7)) }}>
        <AbsoluteFill style={{ transform: `scale(${(1.08 + 0.06 * (1 - b)) * breathe}) translate(${-1.2 * Math.sin(t * 0.21)}%, ${0.8 * Math.cos(t * 0.17)}%)`, transformOrigin: '60% 50%' }}>
          <Img src={staticFile('brand/aura-smooth.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.1) brightness(0.82) contrast(1.12)' }} />
        </AbsoluteFill>
        {blobs.map((o, i) => (
          <AbsoluteFill key={i} style={{ mixBlendMode: 'screen', background: `radial-gradient(circle ${o.s}vw at ${o.x}% ${o.y}%, rgba(${o.c},${o.a * (0.8 + 0.2 * Math.sin(t * 0.7 + i * 2))}) 0%, rgba(${o.c},0) 70%)` }} />
        ))}
      </AbsoluteFill>
      {/* legibility: darken the middle band like the site hero */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 62% 48% at 50% 50%, rgba(0,0,0,${0.62 * dim * 2}) 0%, rgba(0,0,0,${0.35 * dim * 2}) 55%, rgba(0,0,0,0) 100%)` }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 62%, rgba(0,0,0,.75) 100%)' }} />
    </AbsoluteFill>
  )
}
