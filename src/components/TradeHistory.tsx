'use client'

import { ArrowSquareOut } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { explorerTx } from '@/lib/chains'
import { useActivity, type Activity } from '@/lib/data'
import { date } from '@/lib/format'
import { Segmented } from './ui'

// Option-market events only: the fee split, burns and staking live on their own pages.
const TRADE_EVENTS = new Set(['OfferCreated', 'OptionBought', 'Exercised', 'Expired', 'OfferCancelled'])
const LABEL: Record<string, string> = { OfferCreated: 'Listed', OptionBought: 'Filled', Exercised: 'Exercised', Expired: 'Expired', OfferCancelled: 'Cancelled' }
const TONE: Record<string, string> = {
  OfferCreated: 'bg-ink/[0.08] text-ink/80',
  OptionBought: 'bg-call/10 text-call',
  Exercised: 'bg-accent-2/10 text-accent-2',
  Expired: 'bg-warn/10 text-warn',
  OfferCancelled: 'bg-danger/10 text-danger',
}

function ago(at: number, now: number) {
  const s = Math.max(0, Math.floor(now - at))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return date(at)
}

/**
 * Everything that has happened in the market so far: listings, fills, exercises, expiries and cancellations,
 * newest first, each with a link to the transaction. Filterable to the token selected above.
 */
export function TradeHistory({ symbol }: { symbol: string }) {
  const feed = useActivity(100)
  const [scope, setScope] = useState<'token' | 'all'>('all')
  const now = Date.now() / 1000
  const rows = useMemo(() => {
    const all = (feed.data ?? []).filter((e) => TRADE_EVENTS.has(e.name))
    if (scope === 'all' || !symbol) return all
    const re = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    return all.filter((e) => re.test(e.text))
  }, [feed.data, scope, symbol])

  return (
    <section className="mt-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl tracking-tight">Recent trades</h2>
          <p className="mt-1 text-sm text-muted">Every listing, fill, exercise and expiry on {symbol ? 'this market' : 'the market'}, straight from the chain. Open any row on the explorer.</p>
        </div>
        <Segmented value={scope} onChange={(v) => setScope(v as 'token' | 'all')} options={[{ value: 'all', label: 'All tokens' }, { value: 'token', label: symbol || 'Token' }]} />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {['Event', 'Trade', 'Detail', 'When', 'Transaction'].map((h) => (
                <th key={h} className="label px-4 py-3 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e: Activity) => {
              const url = explorerTx(e.tx)
              return (
                <tr key={e.key} className="border-b border-line/60 last:border-0 transition-colors hover:bg-card-2">
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${TONE[e.name] ?? 'bg-ink/[0.06] text-ink/70'}`}>
                      {LABEL[e.name] ?? e.name}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-ink">{e.text}</td>
                  <td className="px-4 py-3.5 text-muted">{e.sub || '–'}</td>
                  <td className="px-4 py-3.5 font-mono text-xs text-muted" title={date(e.at)}>{ago(e.at, now)}</td>
                  <td className="px-4 py-3.5 font-mono text-xs">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-accent hover:underline">
                        {e.tx.slice(0, 10)}…{e.tx.slice(-6)}<ArrowSquareOut size={13} />
                      </a>
                    ) : (
                      <span className="text-faint">{e.tx.slice(0, 10)}…{e.tx.slice(-6)}</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted">{feed.isLoading ? 'Loading…' : scope === 'token' ? `No ${symbol} trades yet.` : 'No trades yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
