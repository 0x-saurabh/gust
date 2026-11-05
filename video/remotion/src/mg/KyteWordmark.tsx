import React from 'react'
import { KYTE_OUTLINE_BOX as BOX, KYTE_OUTLINE_PATH as D } from './kyteOutline'

/**
 * Vector Kyte wordmark (traced outline of public/brand/kyte-wordmark.png).
 * draw: 0..1 stroke draw-on; fill: 0..1 left-to-right fill reveal (hard mask edge); strokeOpacity after fill.
 */
export const KyteWordmark: React.FC<{
  width: number
  draw?: number
  fill?: number
  strokeWidthPx?: number
  strokeOpacity?: number
  id?: string
  style?: React.CSSProperties
}> = ({ width, draw = 1, fill = 1, strokeWidthPx = 1.6, strokeOpacity = 1, id = 'kw', style }) => {
  const pad = BOX.w * 0.02
  const vw = BOX.w + pad * 2
  const vh = BOX.h + pad * 2
  const height = (width * vh) / vw
  const sw = (strokeWidthPx * vw) / width
  const fx = BOX.x - pad + vw * fill
  return (
    <svg width={width} height={height} viewBox={`${BOX.x - pad} ${BOX.y - pad} ${vw} ${vh}`} style={{ display: 'block', overflow: 'visible', ...style }}>
      <defs>
        <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1={BOX.x} x2={BOX.x + BOX.w} y1="0" y2="0">
          <stop offset="0" stopColor="#6EFF85" />
          <stop offset="1" stopColor="#4AFFEC" />
        </linearGradient>
        <clipPath id={`${id}-c`}>
          <rect x={BOX.x - pad} y={BOX.y - pad} width={Math.max(0, fx - (BOX.x - pad))} height={vh} />
        </clipPath>
      </defs>
      {fill > 0 && <path d={D} fillRule="evenodd" fill={`url(#${id}-g)`} clipPath={`url(#${id}-c)`} />}
      {draw > 0 && strokeOpacity > 0 && (
        <path d={D} fill="none" stroke={`url(#${id}-g)`} strokeWidth={sw} strokeLinejoin="round" pathLength={1} strokeDasharray={`${draw} ${1.0001}`} opacity={strokeOpacity} />
      )}
    </svg>
  )
}

export const KYTE_ASPECT = (BOX.h + BOX.w * 0.04) / (BOX.w * 1.04)
