'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Pill CTA in the Optivio style: label on the left, a dark circle with a dotted arrow on the right.
 * Hover: the label rolls up and its duplicate rolls in from below (with a slight skew), the arrow slides
 * out of the circle to the top right while a second one slides in from the bottom left.
 * `premium`: the brand gradient with a glossy top light, a soft glow and a dark circle with a gradient ring (footer).
 */
export function PillButton({ href, children, tone = 'accent', size = 'md', className = '', onClick, disabled }: { href?: string; children: ReactNode; tone?: 'accent' | 'light' | 'dark' | 'premium'; size?: 'md' | 'sm'; className?: string; onClick?: () => void; disabled?: boolean }) {
  const cls = `pill pill-${tone} ${size === 'sm' ? 'pill-sm' : ''} ${className}`
  const inner = (
    <>
      <span className="pill-label">
        <span className="pill-text">{children}</span>
        <span className="pill-text pill-text-2" aria-hidden>{children}</span>
      </span>
      <span className="pill-circle" aria-hidden>
        <Arrow className="pill-arrow pill-arrow-1" />
        <Arrow className="pill-arrow pill-arrow-2" />
      </span>
    </>
  )
  if (href) return <Link href={href} className={cls} onClick={onClick}>{inner}</Link>
  return <button type="button" className={cls} onClick={onClick} disabled={disabled}>{inner}</button>
}

/** Clean stroke arrow (↗): on hover the first flies out to the top right while its twin flies in from the bottom left. */
function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 11.5 11.5 4.5" />
      <path d="M6 4.5h5.5V10" />
    </svg>
  )
}

/** Circular icon button (socials in the footer): icon rolls up and its duplicate rolls in on hover. */
export function CircleButton({ href, label, children, className = '' }: { href: string; label: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} className={`circle-btn ${className}`}>
      <span className="circle-icon">{children}</span>
      <span className="circle-icon circle-icon-2" aria-hidden>{children}</span>
    </a>
  )
}
