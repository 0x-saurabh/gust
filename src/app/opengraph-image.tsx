import { ImageResponse } from 'next/og'
import { BRAND } from '@/lib/config'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, background: '#000000', color: '#ffffff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28, fontWeight: 600 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#4dfca9' }} />
          {BRAND.name}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, fontWeight: 500, letterSpacing: -3, lineHeight: 1 }}>Options, on your terms.</div>
          <div style={{ marginTop: 24, fontSize: 32, color: '#9b9b9b' }}>Covered options on Robinhood Chain</div>
        </div>
        <div style={{ display: 'flex', gap: 40, fontSize: 22, color: '#9b9b9b' }}>
          <span>3% premium fee</span><span>0.1% strike fee</span><span>30 / 20 / 50 split on chain</span>
        </div>
      </div>
    ),
    size,
  )
}
