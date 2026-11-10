'use client'

import { Check } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { chain, CHAIN_SITES } from '@/lib/chains'

/** The two chains Kyte runs on. Each site build serves one chain (NEXT_PUBLIC_CHAIN_ID); picking the other one
 *  sends the user to that chain's deployment on the same path, so Market stays Market. docs/ELYSIUM.md. */
const CHAINS = [
  { id: 4663, name: 'Robinhood', full: 'Robinhood Chain', logo: '/brand/robinhood-mark.svg' },
  { id: 99901, name: 'Elysium', full: 'Elysium', logo: '/brand/elysium-mark.png' },
] as const

function isCurrent(id: number) {
  // devnet and testnets count as their mainnet twin so the button still shows a selection
  if (id === 4663) return chain.id === 4663 || chain.id === 46630 || chain.id === 31337
  return chain.id === id || chain.id === 99801
}

/** Chain picker beside the wallet button: a glass pill with the current chain, opening a small menu of both
 *  chains. Same look and behaviour as the wallet menu: closes on outside click and Escape. */
export function ChainSwitch() {
  // usePathname renders the same on server and client (no hydration mismatch); the query string is dropped on purpose.
  const path = usePathname() || '/'
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const current = CHAINS.find((c) => isCurrent(c.id)) ?? CHAINS[0]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn btn-glass btn-glass-sm !gap-1.5 !px-2.5 sm:!px-3"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Chain: ${current.full}. Switch chain`}
        onClick={() => setOpen((o) => !o)}
      >
        <Image src={current.logo} alt="" width={16} height={16} className="rounded-full" unoptimized />
        <span className="hidden sm:inline">{current.name}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`}><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="wallet-menu absolute right-0 top-[calc(100%+10px)] z-30 w-56 origin-top-right rounded-2xl p-1.5"
          >
            <div className="px-3 pb-2 pt-2 text-[10px] uppercase tracking-[0.16em] text-muted">Chain</div>
            {CHAINS.map((c) => {
              const img = <Image src={c.logo} alt="" width={18} height={18} className="rounded-full" unoptimized />
              if (c.id === current.id) {
                return (
                  <button key={c.id} type="button" role="menuitem" aria-current="true" className="wallet-menu-item text-ink" onClick={() => setOpen(false)}>
                    {img}
                    <span className="flex-1 text-left">{c.full}</span>
                    <Check size={15} className="text-accent" />
                  </button>
                )
              }
              return (
                <a key={c.id} role="menuitem" className="wallet-menu-item" href={`${CHAIN_SITES[c.id]}${path}`} title={`Switch to Kyte on ${c.full}`}>
                  {img}
                  <span className="flex-1 text-left">{c.full}</span>
                </a>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
