import React from 'react'
import { KyteWordmark } from './KyteWordmark'

/** Vector redraw of public/brand/kyte-mark.png (aura tile + wordmark) — crisp at any size. No rounding (clip it). */
export const KyteTile: React.FC<{ size: number; id?: string; wordmark?: boolean }> = ({ size, id = 'tile', wordmark = true }) => (
  <div
    style={{
      width: size, height: size, position: 'relative', overflow: 'hidden',
      background: [
        'radial-gradient(ellipse 75% 60% at 100% 0%, rgba(80,240,150,.95) 0%, rgba(40,200,170,.55) 35%, rgba(0,0,0,0) 72%)',
        'radial-gradient(ellipse 85% 60% at 0% 100%, rgba(60,250,220,.95) 0%, rgba(30,190,200,.6) 38%, rgba(0,0,0,0) 74%)',
        'radial-gradient(ellipse 50% 40% at 95% 100%, rgba(110,255,170,.7) 0%, rgba(0,0,0,0) 70%)',
        '#020605',
      ].join(','),
    }}
  >
    {wordmark && <div style={{ position: 'absolute', left: size * 0.26, top: size / 2 - (size * 0.48 * 0.396) / 2 }}>
      <KyteWordmark id={`${id}-wm`} width={size * 0.48} strokeOpacity={0} />
    </div>}
  </div>
)
