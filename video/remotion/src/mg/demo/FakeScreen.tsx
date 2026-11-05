import React from 'react'
import { AbsoluteFill } from 'remotion'
import { C } from '../../theme'
import { F } from '../fonts'

/** Stand-in for a recording frame, used only by the MG demo compositions (stills). */
export const FakeScreen: React.FC<{ label?: string }> = ({ label = 'recording placeholder' }) => (
  <AbsoluteFill style={{ background: '#050807', fontFamily: F.body, color: C.ink }}>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 60% at 70% 20%, rgba(77,252,169,.10), transparent 70%)' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 72, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 48px', gap: 36, fontSize: 15, color: '#cfd6d2' }}>
      <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 22, color: C.mint }}>Kyte</div>
      <div>Market</div><div>Sell</div><div>Positions</div><div>Stake</div><div>Proof</div>
      <div style={{ marginLeft: 'auto', border: `1px solid ${C.border}`, borderRadius: 999, padding: '8px 16px' }}>0xf39F…2266</div>
    </div>
    <div style={{ position: 'absolute', left: 120, top: 180, width: 980, height: 620, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 36 }}>
      <div style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase' }}>NVDA · 1W</div>
      <svg width={900} height={420} style={{ marginTop: 40 }}>
        <path d="M0 330 C 120 300, 200 340, 300 260 S 500 220, 600 160 S 800 120, 900 60" fill="none" stroke={C.mint} strokeWidth={2} />
      </svg>
    </div>
    <div style={{ position: 'absolute', left: 1160, top: 180, width: 640, height: 620, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 36, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {['Strike', 'Expiry', 'Premium', 'Collateral'].map((k, i) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: 16, fontSize: 18 }}>
          <span style={{ color: C.muted }}>{k}</span><span style={{ fontFamily: F.mono }}>{['$190.00', '1 week', '0.0042 ETH', '1 NVDA'][i]}</span>
        </div>
      ))}
      <div style={{ marginTop: 'auto', height: 60, borderRadius: 12, background: 'linear-gradient(100deg,#6eff85,#4affec)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500, fontSize: 18 }}>Approve & lock 1 NVDA</div>
    </div>
    <div style={{ position: 'absolute', left: 48, bottom: 28, fontFamily: F.mono, fontSize: 12, color: '#3a3a3a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
  </AbsoluteFill>
)
