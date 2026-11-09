'use client'

import { ArrowRight, ChartLineUp, Compass, Sparkle, Wallet } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AsciiField } from '@/components/AsciiField'
import { PillButton } from '@/components/PillButton'
import { BRAND } from '@/lib/config'

/**
 * The 404 page, built from three pieces: a scrambling "404" that resolves itself, a status line that pretends to
 * scan the chain for the missing route, and a set of exits. The ASCII field behind it is the same component the
 * landing page uses. Reduced motion renders the final frame of everything.
 */

const EASE = [0.22, 1, 0.36, 1] as const
const GLYPHS = '0123456789ABCDEF#%&*+=<>/\\|'

/** Characters settle one by one from the left; until then they flicker through hex-like noise. */
function Scramble({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? text : '')
  useEffect(() => {
    if (reduce) { setShown(text); return }
    let raf = 0
    const t0 = performance.now() + delay
    const step = (now: number) => {
      const t = Math.max(0, now - t0)
      const settled = Math.floor(t / 90)
      let out = ''
      for (let i = 0; i < text.length; i++) {
        if (text[i] === ' ') { out += ' '; continue }
        out += i < settled ? text[i] : t === 0 ? ' ' : GLYPHS[Math.floor((now / 40 + i * 7) % GLYPHS.length)]
      }
      setShown(out)
      if (settled < text.length) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, delay, reduce])
  return <span className={className} aria-label={text}>{shown}</span>
}

const SCAN = ['scanning recent blocks', 'checking the AssetRegistry', 'asking the indexer', 'no route at this address']

/** The "looking for it" line: cycles through three steps and lands on the verdict. */
function ScanLine({ path }: { path: string }) {
  const reduce = useReducedMotion()
  const [i, setI] = useState(reduce ? SCAN.length - 1 : 0)
  useEffect(() => {
    if (reduce || i >= SCAN.length - 1) return
    const t = setTimeout(() => setI((n) => n + 1), 650)
    return () => clearTimeout(t)
  }, [i, reduce])
  const done = i >= SCAN.length - 1
  return (
    <div className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
      <span className="relative flex size-2">
        {!done && <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />}
        <span className={`relative inline-flex size-2 rounded-full ${done ? 'bg-danger' : 'bg-accent'}`} />
      </span>
      <span className={done ? 'text-ink/80' : ''}>{SCAN[i]}{done ? '' : '…'}</span>
      <span className="truncate text-faint">{path}</span>
    </div>
  )
}

const EXITS = [
  { href: '/market', icon: ChartLineUp, title: 'Market', body: 'Open calls and puts on every listed token, live from the chain.' },
  { href: '/positions', icon: Wallet, title: 'Positions', body: 'What you hold, what you wrote and what expires next.' },
  { href: '/agent', icon: Sparkle, title: 'Ask Kyte', body: 'Describe what you were looking for; the agent finds the page or the offer.' },
  { href: 'https://docs.kyte.sh/', icon: Compass, title: 'Docs', body: 'How it works, fees, rules and every contract address.', external: true },
] as const

export function NotFoundScene() {
  const reduce = useReducedMotion()
  const path = usePathname() || '/'
  const shownPath = `${BRAND.name.toLowerCase()}.sh${path.length > 48 ? `${path.slice(0, 48)}…` : path}`
  const fade = (delay: number) => ({ initial: reduce ? false : { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay, ease: EASE } })
  return (
    <section className="relative -mx-4 overflow-hidden px-4 pb-16 pt-20 md:-mx-6 md:px-6 md:pt-28">
      <AsciiField className="absolute inset-0 h-full w-full opacity-70" density={16} speed={0.6} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 55% at 50% 35%, rgba(2,6,5,.35), rgba(2,6,5,.96) 80%)' }} />

      <div className="relative mx-auto max-w-5xl">
        <motion.div {...fade(0)} className="eyebrow flex items-center gap-3"><span className="grad-bg h-px w-8" />Not found</motion.div>

        <motion.div {...fade(0.05)} className="mt-6 select-none">
          <Scramble text="404" className="font-display block text-[112px] font-medium leading-none tracking-[-0.04em] text-ink md:text-[200px]" />
        </motion.div>

        <motion.h1 {...fade(0.15)} className="font-display mt-4 max-w-2xl text-[30px] font-medium leading-[1.05] md:text-[48px]">
          This page is not <span className="grad-text">on the chain.</span>
        </motion.h1>
        <motion.p {...fade(0.22)} className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink/70 md:text-[18px]">
          The address you followed does not resolve to anything on {BRAND.name}. Nothing was sent, nothing was signed. The market, your positions and the docs are one tap away.
        </motion.p>

        <motion.div {...fade(0.3)} className="panel grain relative mt-8 inline-flex max-w-full flex-col gap-3 overflow-hidden rounded-2xl px-4 py-3">
          <ScanLine path={shownPath} />
        </motion.div>

        <motion.div {...fade(0.38)} className="mt-8 flex flex-wrap gap-3">
          <PillButton href="/" tone="premium">Back to {BRAND.name}</PillButton>
          <Link href="/market" className="btn btn-glass">Open the market <ArrowRight size={16} /></Link>
        </motion.div>

        <motion.div {...fade(0.48)} className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {EXITS.map((e) => {
            const Icon = e.icon
            const inner = (
              <>
                <div className="flex items-center justify-between">
                  <span className="grid size-9 place-items-center rounded-xl border border-white/[.08] bg-black/40 text-accent"><Icon size={18} /></span>
                  <ArrowRight size={14} className="text-muted transition-transform duration-300 group-hover:translate-x-1 group-hover:text-ink" />
                </div>
                <div className="mt-4 text-[15px] font-medium text-ink">{e.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink/60">{e.body}</p>
              </>
            )
            const cls = 'hair group block h-full rounded-2xl border bg-black/35 p-4 backdrop-blur-sm transition-colors duration-300 hover:border-[rgba(160,255,220,.3)]'
            return 'external' in e && e.external
              ? <a key={e.href} href={e.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
              : <Link key={e.href} href={e.href} className={cls}>{inner}</Link>
          })}
        </motion.div>

        <motion.p {...fade(0.6)} className="mt-10 text-[12px] text-faint">
          If a link on {BRAND.name} brought you here, tell us: <a href="mailto:contact@kyte.sh" className="text-muted underline decoration-white/20 underline-offset-4 hover:text-ink">contact@kyte.sh</a>
        </motion.p>
      </div>
    </section>
  )
}
