import React from 'react'

export type IconName = 'lock' | 'fill' | 'settle' | 'split' | 'check' | 'coin' | 'arrow' | 'chain' | 'nft'

const P: Record<IconName, React.ReactNode> = {
  lock: (<><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  fill: (<><path d="M4 9h13l-3.5-3.5" /><path d="M20 15H7l3.5 3.5" /></>),
  settle: (<><circle cx="12" cy="12" r="8" /><path d="M8.5 12.3l2.3 2.3 4.7-4.9" /></>),
  split: (<><path d="M12 20v-6" /><path d="M12 14L6 6" /><path d="M12 14l6-8" /><path d="M6 10V6h4" /><path d="M18 10V6h-4" /></>),
  check: (<path d="M5 12.5l4.5 4.5L19 7.5" />),
  coin: (<><circle cx="12" cy="12" r="8" /><path d="M12 7.5v9M9.5 9.5h3.8a1.7 1.7 0 0 1 0 3.4h-2.6a1.7 1.7 0 0 0 0 3.4h3.8" /></>),
  arrow: (<path d="M5 12h14M13 6l6 6-6 6" />),
  chain: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  nft: (<><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M8.5 15l2.5-3 2 2 2.5-3.5" /></>),
}

/** Tiny line icon (24-unit grid, stroked). */
export const Icon: React.FC<{ name: IconName; size?: number; color?: string; stroke?: number }> = ({ name, size = 18, color = 'currentColor', stroke = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none' }}>
    {P[name]}
  </svg>
)
