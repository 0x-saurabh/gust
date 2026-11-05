import React from 'react'
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion'
import { C, H, W } from '../theme'
import { EYEBROW, F } from './fonts'
import { KyteWordmark } from './KyteWordmark'
import { clamp01, easeIn, easeInOut, eprog, lerp, prog, WordRise, words, type Rect } from './motion'

export const NFT_CARD = { w: 400, h: 560 }
/** Default timing (frames from `start`): flip-in, hold, fly-out. Total = NFT_TOTAL. */
export const NFT_T = { flip: 54, hold: 72, fly: 42 }
export const NFT_TOTAL = NFT_T.flip + NFT_T.hold + NFT_T.fly

/**
 * The option NFT. Flips out of `from` (e.g. the Confirmed toast rect) with a 3D rotateY, lands centered with a
 * soft shadow and a mint rim-light sweep, holds ~1.2 s with title/subtitle, then flies into `to`
 * (e.g. the nav "Positions" link), shrinking into it. A dark scrim dims the recording behind while it holds.
 * svgUrl: path under public/ (staticFile) of the real tokenURI SVG; defaults to the placeholder.
 */
export const NftCard: React.FC<{
  svgUrl?: string
  title?: string
  subtitle?: string
  from: Rect
  to: Rect
  start?: number
  hold?: number
}> = ({ svgUrl = 'nft/placeholder.svg', title = 'Your Option NFT', subtitle = 'ERC-721 · transferable', from, to, start = 0, hold = NFT_T.hold }) => {
  const frame = useCurrentFrame() - start
  const flyStart = NFT_T.flip + hold
  if (frame < 0 || frame > flyStart + NFT_T.fly + 12) return null

  const cw = NFT_CARD.w, ch = NFT_CARD.h
  const home = { x: W / 2 - cw / 2, y: H / 2 - ch / 2 - 30 }

  // flip-in: position/scale from the source rect, rotateY 180 -> 0
  const pIn = eprog(frame, 0, NFT_T.flip)
  const rot = lerp(-180, 0, eprog(frame, 0, NFT_T.flip + 6))
  const s0 = Math.min(from.w / cw, from.h / ch)
  const fromC = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
  // fly-out: ease-in on position, into the target rect
  const pOut = easeInOut(prog(frame, flyStart, NFT_T.fly))
  const s1 = Math.max(0.04, Math.min(to.w / cw, to.h / ch))
  const toC = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
  const homeC = { x: home.x + cw / 2, y: home.y + ch / 2 }

  const cx = pOut > 0 ? lerp(homeC.x, toC.x, pOut) : lerp(fromC.x, homeC.x, pIn)
  const cy = pOut > 0 ? lerp(homeC.y, toC.y, easeIn(prog(frame, flyStart, NFT_T.fly)) * 0.4 + pOut * 0.6) : lerp(fromC.y, homeC.y, pIn)
  const scale = pOut > 0 ? lerp(1, s1, pOut) : lerp(s0, 1, pIn)
  const tilt = pOut > 0 ? lerp(0, 10, Math.sin(pOut * Math.PI)) : 0
  const cardOpacity = pOut > 0 ? 1 - clamp01((pOut - 0.86) / 0.14) : clamp01(frame / 4)

  // rim light sweep after landing
  const sweep = prog(frame, NFT_T.flip - 6, 44)
  const sweepX = lerp(-0.6, 1.6, easeInOut(sweep))

  // scrim + text
  const scrim = eprog(frame, 0, 30) * (1 - eprog(frame, flyStart, 30))
  const textStart = NFT_T.flip - 14
  const textExit = flyStart - 8
  const eyebrowP = eprog(frame, textStart, 36) - easeInOut(prog(frame, textExit, 20))

  // landing pulse at the target
  const pulse = prog(frame, flyStart + NFT_T.fly - 6, 20)

  const front = rot > -90
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 60% 70% at 50% 46%, rgba(0,0,0,.78), rgba(0,0,0,.6))', opacity: scrim }} />
      <div
        style={{
          position: 'absolute', left: cx - cw / 2, top: cy - ch / 2, width: cw, height: ch,
          transform: `perspective(1800px) scale(${scale}) rotateY(${rot}deg) rotateZ(${-tilt * 0.3}deg) rotateX(${tilt * 0.4}deg)`,
          opacity: cardOpacity,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, borderRadius: 24, boxShadow: `0 40px 90px rgba(0,0,0,.65), 0 0 ${lerp(0, 70, pIn) * (1 - pOut)}px rgba(77,252,169,.18)` }} />
        {front ? (
          <div style={{ position: 'absolute', inset: 0, borderRadius: 24, overflow: 'hidden', background: '#0b0f0d' }}>
            <Img src={staticFile(svgUrl)} style={{ width: '100%', height: '100%', display: 'block' }} />
            {/* rim light: a thin mint band travelling round the edge */}
            <div
              style={{
                position: 'absolute', inset: 0, borderRadius: 24, padding: 1.5,
                background: `linear-gradient(115deg, transparent ${(sweepX - 0.25) * 100}%, rgba(124,255,142,.0) ${(sweepX - 0.18) * 100}%, ${C.mint} ${sweepX * 100}%, rgba(74,240,255,0) ${(sweepX + 0.18) * 100}%, transparent ${(sweepX + 0.25) * 100}%)`,
                WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                WebkitMaskComposite: 'xor', maskComposite: 'exclude',
                opacity: sweep > 0 && sweep < 1 ? 1 : 0,
              }}
            />
            <div
              style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(115deg, transparent ${(sweepX - 0.2) * 100}%, rgba(255,255,255,.07) ${sweepX * 100}%, transparent ${(sweepX + 0.2) * 100}%)`,
                opacity: sweep > 0 && sweep < 1 ? 1 : 0,
              }}
            />
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, borderRadius: 24, background: '#0b0f0d', border: `1px solid ${C.border}`, transform: 'rotateY(180deg)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, rgba(77,252,169,.25), transparent 60%), radial-gradient(circle at 80% 90%, rgba(74,240,255,.2), transparent 60%)' }} />
            <KyteWordmark id="nft-back" width={180} />
          </div>
        )}
      </div>

      {/* title / subtitle under the card */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: home.y + ch + 34, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <WordRise frame={frame} words={words(title)} start={textStart} stagger={3} dur={44} exit={textExit} exitDur={22}
          style={{ fontFamily: F.hero, fontWeight: 300, fontSize: 44, letterSpacing: '-0.03em', color: '#f2f7f4', lineHeight: 1.05 }} />
        <div style={{ overflow: 'hidden' }}>
          <div style={{ ...EYEBROW, fontSize: 14, color: C.muted, transform: `translateY(${(1 - clamp01(eyebrowP)) * 110}%)` }}>{subtitle}</div>
        </div>
      </div>

      {/* arrival pulse at the target */}
      {pulse > 0 && pulse < 1 && (
        <div
          style={{
            position: 'absolute', left: to.x - 6, top: to.y - 6, width: to.w + 12, height: to.h + 12, borderRadius: 12,
            border: `2px solid ${C.mint}`, transform: `scale(${lerp(0.9, 1.25, easeInOut(pulse))})`, opacity: 1 - pulse,
          }}
        />
      )}
    </AbsoluteFill>
  )
}

export const nftLandFrame = (start = 0, hold = NFT_T.hold) => start + NFT_T.flip + hold + NFT_T.fly - 6
