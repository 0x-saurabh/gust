'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { isDevnet } from '@/lib/chains'
import { BRAND } from '@/lib/config'
import { ConnectButton } from './ConnectButton'
import { Faucet } from './Faucet'
import { Logo } from './Logo'

const LINKS = [
  { href: '/market', label: 'Market' },
  { href: '/sell', label: 'Sell' },
  { href: '/positions', label: 'Positions' },
  { href: '/stake', label: 'Stake' },
  { href: '/proof', label: 'Proof' },
  { href: '/docs', label: 'Docs' },
]
const EASE = [0.22, 1, 0.36, 1] as const

/** Floating pill bar (B7): translucent, blurred, off the top edge. Mobile menu is a full height panel. */
export function Nav() {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [path])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <header className="sticky top-4 z-20 px-4">
        <nav aria-label="Main" className="glass mx-auto flex h-12 w-full max-w-5xl items-center gap-4 rounded-full pl-2 pr-2">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <Logo size={30} />
            {BRAND.name}
            {isDevnet && <span className="ml-1 rounded-full border border-accent/30 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-accent">devnet</span>}
          </Link>
          <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {LINKS.map((l) => {
              const active = path === l.href
              return (
                <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined} className={`relative rounded-full px-3 py-1 text-sm transition-colors duration-300 ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}>
                  {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-white/[0.08]" transition={{ type: 'spring', stiffness: 300, damping: 28 }} />}
                  <span className="relative">{l.label}</span>
                </Link>
              )
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:inline-flex"><Faucet /></span>
            <ConnectButton />
            <button
              type="button"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="relative flex size-8 items-center justify-center rounded-full md:hidden"
            >
              <motion.span className="absolute h-px w-4 bg-ink" animate={{ rotate: open ? 45 : 0, y: open ? 0 : -3 }} transition={{ duration: 0.5, ease: EASE }} />
              <motion.span className="absolute h-px w-4 bg-ink" animate={{ rotate: open ? -45 : 0, y: open ? 0 : 3 }} transition={{ duration: 0.5, ease: EASE }} />
            </button>
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="fixed inset-0 z-10 bg-bg/95 pt-24 backdrop-blur-xl md:hidden"
          >
            <ul className="px-6">
              {LINKS.map((l, i) => (
                <motion.li
                  key={l.href}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: Math.min(i * 0.06, 0.4) }}
                >
                  <Link href={l.href} aria-current={path === l.href ? 'page' : undefined} className={`block border-b border-line py-4 text-2xl ${path === l.href ? 'text-ink' : 'text-muted'}`}>
                    {l.label}
                  </Link>
                </motion.li>
              ))}
              <motion.li initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.4 }} className="pt-6">
                <Faucet />
              </motion.li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
