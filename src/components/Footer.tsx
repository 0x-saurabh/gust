'use client'

// Footer in the Kyte brand-site design (Updraft folder: components/site.tsx Footer + outline-word.tsx),
// with the app's own link columns and the live indexer status.
import Link from 'next/link'
import { chain } from '@/lib/chains'
import { BRAND } from '@/lib/config'
import { useHealth } from '@/lib/data'
import { XButton, X_URL } from './landing/kit'
import { OutlineWord } from './landing/OutlineWord'
import { Logo } from './Logo'
import { PillButton } from './PillButton'

const COLS: { t: string; l: { h: string; n: string }[] }[] = [
  { t: 'Product', l: [{ h: '/market', n: 'Market' }, { h: '/sell', n: 'Sell an option' }, { h: '/positions', n: 'Positions' }, { h: '/stake', n: 'Stake' }] },
  { t: 'Protocol', l: [{ h: '/proof', n: 'Proof of burns' }, { h: '/docs', n: 'Documentation' }, { h: '/docs#contracts', n: 'Contracts' }, { h: '/docs#risks', n: 'Risks' }] },
  { t: 'Legal', l: [{ h: '/terms', n: 'Terms of Use' }, { h: '/privacy', n: 'Privacy Policy' }, { h: X_URL, n: 'X / @useKyte' }, { h: 'mailto:contact@kyte.sh', n: 'Contact' }] },
]

/**
 * Footer link with the hover effect from the reference recording: the label brightens, rolls up into a fresh copy
 * (`link-roll`), and a hairline underline draws in from the left (`lnk`). The roll sits inside the link so the
 * underline is not clipped by the roll's hidden overflow; `.lnk:hover` drives both (see globals.css).
 */
function FootLink({ href, children }: { href: string; children: string }) {
  const cls = 'lnk inline-block text-[15px] text-ink/75 transition-colors duration-300 hover:text-ink'
  const inner = (
    <span className="link-roll">
      <span className="link-roll-text">{children}</span>
      <span className="link-roll-text link-roll-text-2" aria-hidden>{children}</span>
    </span>
  )
  if (href.startsWith('/')) return <Link href={href} className={cls}>{inner}</Link>
  return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={cls}>{inner}</a>
}

export function Footer() {
  const health = useHealth()
  const synced = Boolean(health.data && health.data.lastBlock > 0)
  return (
    <footer className="relative mt-32 overflow-hidden" style={{ background: 'linear-gradient(180deg, #000 0%, #010303 100%)' }}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(110,255,170,.35) 30%, rgba(74,255,236,.35) 70%, transparent)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56" style={{ background: 'linear-gradient(180deg, rgba(160,255,220,.035), transparent)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(70% 45% at 50% 100%, rgba(74,255,236,.13), transparent 70%), radial-gradient(45% 40% at 15% 100%, rgba(110,255,133,.12), transparent 70%), radial-gradient(40% 35% at 88% 100%, rgba(74,255,236,.08), transparent 70%)' }} />
      <div className="relative mx-auto max-w-[1240px] px-5 py-16 md:px-8 md:py-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" aria-label={`${BRAND.name} home`} className="inline-block">
              <Logo size={64} />
            </Link>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-ink/60">
              Options, on Your terms. A non-custodial, fully collateralised options market on Robinhood Chain.
            </p>
            {/* Two calls to action: the brand-site X button and the app's rolling pill (label and arrow switch on hover). */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <PillButton href="/market" tone="light">Start trading</PillButton>
              <XButton variant="ghost" />
            </div>
            <a href="mailto:contact@kyte.sh" className="lnk mono mt-6 inline-block text-[13px] text-ink/60 hover:text-ink">contact@kyte.sh</a>
          </div>
          {COLS.map((c) => (
            <div key={c.t}>
              <div className="eyebrow">{c.t}</div>
              <ul className="mt-5 space-y-3">
                {c.l.map((l) => (
                  <li key={l.h}><FootLink href={l.h}>{l.n}</FootLink></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 md:mt-20">
          <OutlineWord />
        </div>
        <div className="hair mt-10 flex flex-col gap-4 border-t pt-8 text-[13px] text-ink/45 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl leading-relaxed">Options are risky and can expire worthless. Nothing here is investment advice. Not available where prohibited. {BRAND.name} is not affiliated with or endorsed by Robinhood.</p>
          <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
            <span className="hair inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs text-ink/60">
              <span className={`relative size-1.5 rounded-full ${synced ? 'bg-[#6EFF85]' : 'bg-warn'}`}>
                {synced && <span className="absolute inset-0 animate-ping rounded-full bg-[#6EFF85] opacity-60 motion-reduce:hidden" />}
              </span>
              {synced ? `Indexer synced · block #${health.data?.lastBlock}` : 'Connecting…'} · {chain.name}
            </span>
            <p className="mono">© {new Date().getFullYear()} {BRAND.name} · kyte.sh</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
