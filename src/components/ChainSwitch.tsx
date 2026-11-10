'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { chain, CHAIN_SITES } from '@/lib/chains'

/** The two chains Kyte runs on. Each site build serves one chain (NEXT_PUBLIC_CHAIN_ID); the toggle sends the
 *  user to the other chain's deployment on the same path, so Market stays Market. docs/ELYSIUM.md. */
const CHAINS = [
  { id: 4663, name: 'Robinhood', full: 'Robinhood Chain', logo: '/brand/robinhood-mark.svg' },
  { id: 99901, name: 'Elysium', full: 'Elysium', logo: '/brand/elysium-mark.png' },
] as const

function isCurrent(id: number) {
  // devnet and testnets count as their mainnet twin so the toggle still shows a selection
  if (id === 4663) return chain.id === 4663 || chain.id === 46630 || chain.id === 31337
  return chain.id === id || chain.id === 99801
}

export function ChainSwitch({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  // usePathname renders the same on server and client (no hydration mismatch); the query string is dropped on purpose.
  const path = usePathname() || '/'
  const lg = size === 'lg'
  return (
    <div role="group" aria-label="Chain" className={`inline-flex items-center rounded-full border border-line bg-white/[0.03] p-0.5 ${lg ? 'gap-1' : ''}`}>
      {CHAINS.map((c) => {
        const current = isCurrent(c.id)
        const cls = `flex items-center gap-1.5 rounded-full transition-colors duration-300 ${lg ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs'} ${current ? 'bg-white/[0.1] text-ink' : 'text-muted hover:text-ink'}`
        const img = <Image src={c.logo} alt="" width={lg ? 18 : 14} height={lg ? 18 : 14} className="rounded-full" unoptimized />
        if (current) {
          return (
            <span key={c.id} aria-current="true" title={`You are on ${c.full}`} className={cls}>
              {img}
              <span className="font-medium">{c.name}</span>
            </span>
          )
        }
        return (
          <a key={c.id} href={`${CHAIN_SITES[c.id]}${path}`} title={`Switch to Kyte on ${c.full}`} className={cls}>
            {img}
            <span>{c.name}</span>
          </a>
        )
      })}
    </div>
  )
}
