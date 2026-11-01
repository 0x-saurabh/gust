'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Pill CTA in the Optivio style: label on the left, a dark circle with a dotted arrow on the right.
 * Hover: the label rolls up and its duplicate rolls in from below (with a slight skew), the arrow slides
 * out of the circle to the top right while a second one slides in from the bottom left.
 */
export function PillButton({ href, children, tone = 'accent', className = '', onClick }: { href?: string; children: ReactNode; tone?: 'accent' | 'light' | 'dark'; className?: string; onClick?: () => void }) {
  const cls = `pill pill-${tone} ${className}`
  const inner = (
    <>
      <span className="pill-label">
        <span className="pill-text">{children}</span>
        <span className="pill-text pill-text-2" aria-hidden>{children}</span>
      </span>
      <span className="pill-circle" aria-hidden>
        <DotArrow className="pill-arrow pill-arrow-1" />
        <DotArrow className="pill-arrow pill-arrow-2" />
      </span>
    </>
  )
  if (href) return <Link href={href} className={cls} onClick={onClick}>{inner}</Link>
  return <button type="button" className={cls} onClick={onClick}>{inner}</button>
}

/** Pixel style arrow (↗) made of dots. */
function DotArrow({ className = '' }: { className?: string }) {
  const dots: [number, number][] = [[5, 1], [6, 1], [7, 1], [7, 2], [7, 3], [6, 2], [5, 3], [4, 4], [3, 5], [2, 6], [1, 7]]
  return (
    <svg viewBox="0 0 9 9" width="16" height="16" className={className} fill="currentColor">
      {dots.map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width="1" height="1" rx="0.2" />)}
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
