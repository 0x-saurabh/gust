'use client'
import { ArrowUpRight } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { PillButton } from '@/components/PillButton'
import { TokenLogo } from '@/components/TokenLogo'
import { Note, PageHeader, Segmented } from '@/components/ui'
import { INDEXER_URL } from '@/lib/data'
import { compact, num } from '@/lib/format'

type Tab = 'recent' | 'graduated' | 'near' | 'listed'
type PonsToken = {
  address: string; symbol: string; name: string; logo: string | null; description: string | null
  pairIsWeth: boolean; legacy: boolean; launchedAt: number; pairedEth: number | null; thresholdEth: number | null; progress: number | null
  graduated: boolean; graduatedAt: number | null
  priceUsd: number | null; priceEth: number | null; mcapUsd: number | null; change24h: number | null; liquidityUsd: number | null; volume24hUsd: number | null
  kyte: 'listed' | 'disabled' | 'unlisted'; ponsUrl: string
}
type Resp = { tokens: PonsToken[]; counts: { launched: number; graduated: number } }

const ago = (t: number | null) => {
  if (!t) return ''
  const s = Math.max(0, Date.now() / 1000 - t)
  return s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`
}
const usd = (n: number | null) => (n == null || !Number.isFinite(n) || n === 0 ? '—' : n >= 1000 ? `$${compact(n)}` : n >= 1 ? `$${num(n, 2)}` : `$${n.toPrecision(3)}`)

export default function Page() {
  const [tab, setTab] = useState<Tab>('graduated')
  const [hours, setHours] = useState<'24' | '36'>('24')
  const q = useQuery({
    queryKey: ['pons', tab, hours],
    queryFn: async (): Promise<Resp> => { const r = await fetch(`${INDEXER_URL}/pons/tokens?status=${tab}&hours=${hours}&limit=200`, { cache: 'no-store' }); if (!r.ok) throw new Error(`indexer ${r.status}`); return r.json() },
    refetchInterval: 60_000,
    enabled: Boolean(INDEXER_URL),
  })
  const tokens = q.data?.tokens ?? []
  const counts = q.data?.counts

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24">
      <PageHeader title="Launchpad" sub="Tokens that graduated on Pons, the Robinhood Chain launchpad. A graduated token has crossed 4.2 ETH of locked liquidity. Listed ones trade on Kyte with 24-hour options only.">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'recent', label: 'Recent' }, { value: 'graduated', label: 'Graduated' }, { value: 'near', label: 'Near graduation' }, { value: 'listed', label: 'On Kyte' }]} />
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {counts && <p className="text-sm text-muted">{counts.graduated} graduated of {counts.launched} launched. Data from the Pons factory on chain and DexScreener; refreshed every minute.</p>}
        {tab === 'recent' && <Segmented value={hours} onChange={setHours} options={[{ value: '24', label: 'Last 24 hours' }, { value: '36', label: 'Last 36 hours' }]} />}
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : q.isError ? (
        <Note tone="warn">The indexer is not reachable right now. Try again in a minute.</Note>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted">{tab === 'recent' ? `No launches in the last ${hours} hours.` : tab === 'near' ? 'No token is above half of its graduation threshold right now.' : tab === 'listed' ? 'No Pons token is listed on Kyte yet.' : 'Nothing graduated yet.'}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tokens.map((t) => (
            <li key={t.address} className="card flex flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                {t.logo ? <img src={t.logo} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full border border-white/10 object-cover" /> : <TokenLogo symbol={t.symbol} name={t.name} address={t.address} size={40} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{t.name}</span>
                    <span className="font-mono text-xs text-muted">{t.symbol}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    {t.graduated ? <span>Graduated {ago(t.graduatedAt)}</span> : t.progress != null ? <span>{Math.round(t.progress * 100)}% to graduation</span> : <span>Launched {ago(t.launchedAt)}</span>}
                    {!t.pairIsWeth && <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5">not ETH-paired</span>}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${t.kyte === 'listed' ? 'bg-accent/15 text-accent' : t.kyte === 'disabled' ? 'bg-white/[0.06] text-muted' : 'border border-white/10 text-muted'}`}>
                  {t.kyte === 'listed' ? 'On Kyte' : t.kyte === 'disabled' ? 'Paused' : 'Not listed'}
                </span>
              </div>

              {t.progress != null && !t.graduated && (
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-ink/70" style={{ width: `${Math.round(t.progress * 100)}%` }} /></div>
              )}

              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-muted">Market cap</dt><dd className="mt-0.5 font-mono text-ink">{usd(t.mcapUsd)}</dd></div>
                <div><dt className="text-muted">24h</dt><dd className={`mt-0.5 font-mono ${t.change24h == null ? 'text-ink' : t.change24h >= 0 ? 'text-accent' : 'text-[#ff7a7a]'}`}>{t.change24h == null ? '—' : `${t.change24h >= 0 ? '+' : ''}${num(t.change24h, 1)}%`}</dd></div>
                <div><dt className="text-muted">Liquidity</dt><dd className="mt-0.5 font-mono text-ink">{usd(t.liquidityUsd)}</dd></div>
              </dl>

              <div className="mt-auto flex items-center gap-2">
                {t.kyte === 'listed' && (
                  <>
                    <PillButton href={`/sell?kind=call&token=${t.symbol}&expiry=86400`} tone="premium" size="sm">Sell a 24h call</PillButton>
                    <Link href={`/market?token=${t.symbol}`} className="btn btn-glass btn-glass-sm">Market</Link>
                  </>
                )}
                <a href={t.ponsUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-ink">Trade on Pons <ArrowUpRight size={12} /></a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10"><Note>Pons tokens are young and volatile. Kyte lists graduated, ETH-paired tokens after a review and only allows options that expire within 24 hours on them. Graduation is a liquidity threshold, not a quality signal. Options are risky and can expire worthless.</Note></div>
    </div>
  )
}
