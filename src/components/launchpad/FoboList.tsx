'use client'
import { ArrowUpRight, Check, Copy } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { PillButton } from '@/components/PillButton'
import { TokenLogo } from '@/components/TokenLogo'
import { Note, Segmented } from '@/components/ui'
import { INDEXER_URL } from '@/lib/data'
import { compact, num, shortAddr } from '@/lib/format'

export type FoboTab = 'eligible' | 'near' | 'recent' | 'listed'
export type FoboToken = {
  address: string; symbol: string; name: string; decimals: number; creator: string; quote: string; quoteIsEth: boolean; poolId: string
  launchedAt: number; launchTx: string; ageSec: number
  floorEth: number | null; floorBackingEth: number | null; circulating: number | null; floorVsPrice: number | null
  progress: number | null; barEth: number; minAgeSec: number; eligible: boolean; eligibleAt: number | null
  priceUsd: number | null; priceEth: number | null; mcapUsd: number | null; change24h: number | null; liquidityUsd: number | null; volume24hUsd: number | null
  kyte: 'listed' | 'disabled' | 'scheduled' | 'unlisted'; supply: number | null; foboUrl: string
  links: { fobo: string; dexscreener: string; token: string; hook: string; creator: string; launchTx: string }
}
type Resp = { tokens: FoboToken[]; counts: { launched: number; ethQuoted: number; eligible: number }; rule: { minAgeSec: number; minFloorEth: number } }

const ago = (s: number) => (s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${(s / 86400).toFixed(1)}d`)
const when = (t: number | null) => (t ? new Date(t * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const ethp = (n: number | null) => (n == null || !Number.isFinite(n) || n === 0 ? '—' : n >= 0.001 ? `${num(n, 5)} ETH` : `${n.toPrecision(3)} ETH`)
const usd = (n: number | null) => (n == null || !Number.isFinite(n) || n === 0 ? '—' : n >= 1000 ? `$${compact(n)}` : n >= 1 ? `$${num(n, 2)}` : `$${n.toPrecision(3)}`)
function CopyAddr({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1200) }).catch(() => {}) }} className="inline-flex items-center gap-1 font-mono text-xs text-muted hover:text-ink" title={value}>
      {shortAddr(value)} {done ? <Check size={11} /> : <Copy size={11} />}
    </button>
  )
}

/** FOBO launchpad tokens: the floor each one guarantees, whether it clears Kyte's bar, and the ones already on Kyte. */
export function FoboList() {
  const [tab, setTab] = useState<FoboTab>('eligible')
  const q = useQuery({
    queryKey: ['fobo', tab],
    queryFn: async (): Promise<Resp> => { const r = await fetch(`${INDEXER_URL}/fobo/tokens?status=${tab}&limit=200`, { cache: 'no-store' }); if (!r.ok) throw new Error(`indexer ${r.status}`); return r.json() },
    refetchInterval: 60_000,
    enabled: Boolean(INDEXER_URL),
  })
  const tokens = q.data?.tokens ?? []
  const counts = q.data?.counts
  const bar = q.data?.rule?.minFloorEth ?? 4.2

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {counts && <p className="text-sm text-muted">{counts.eligible} clear the bar of {counts.ethQuoted} ETH-quoted ({counts.launched} launched). Floors read from FoboHook on chain every two minutes; prices from DexScreener.</p>}
        <Segmented value={tab} onChange={setTab} options={[{ value: 'eligible', label: 'Clears the bar' }, { value: 'near', label: 'Getting close' }, { value: 'recent', label: 'New (72h)' }, { value: 'listed', label: 'On Kyte' }]} />
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : q.isError ? (
        <Note tone="warn">The indexer is not reachable right now. Try again in a minute.</Note>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted">{tab === 'listed' ? 'No FOBO token is listed on Kyte yet.' : tab === 'eligible' ? `No FOBO token backs ${bar} ETH at its floor yet.` : 'Nothing here right now.'}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tokens.map((t) => (
            <li key={t.address} className="card flex flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                <TokenLogo symbol={t.symbol} name={t.name} address={t.address} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-medium text-ink">{t.symbol}</span>
                    <span className="truncate text-sm text-muted">{t.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider">
                    {t.kyte === 'listed' ? <span className="rounded-full border border-accent/40 px-2 py-0.5 text-accent">On Kyte</span>
                      : t.kyte === 'scheduled' ? <span className="rounded-full border border-white/15 px-2 py-0.5 text-muted">Listing in 10 min</span>
                      : t.eligible ? <span className="rounded-full border border-accent/30 px-2 py-0.5 text-accent/90">Clears the bar</span>
                      : <span className="rounded-full border border-white/10 px-2 py-0.5 text-muted">{t.quoteIsEth ? `${Math.round((t.progress ?? 0) * 100)}% of ${bar} ETH` : 'not ETH-quoted'}</span>}
                    {t.ageSec < t.minAgeSec && t.quoteIsEth && <span className="rounded-full border border-white/10 px-2 py-0.5 text-muted">{ago(t.minAgeSec - t.ageSec)} to 24h</span>}
                  </div>
                </div>
              </div>

              {t.quoteIsEth && t.progress != null && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]" title={`Floor backs ${num(t.floorBackingEth ?? 0, 2)} of ${bar} ETH`}>
                  <div className={`h-full rounded-full ${t.eligible ? 'bg-accent' : 'bg-[#f5b547]'}`} style={{ width: `${Math.max(2, Math.round(t.progress * 100))}%` }} />
                </div>
              )}

              <dl className="grid grid-cols-3 gap-x-2 gap-y-3 text-xs">
                <div><dt className="text-muted">Price</dt><dd className="mt-0.5 font-mono text-ink">{usd(t.priceUsd)}</dd><dd className="font-mono text-[10px] text-muted">{ethp(t.priceEth)}</dd></div>
                <div><dt className="text-muted">Floor</dt><dd className="mt-0.5 font-mono text-[#f5b547]">{t.floorEth ? `${t.floorEth.toPrecision(3)} ETH` : '—'}</dd><dd className="font-mono text-[10px] text-muted">{t.floorVsPrice != null ? `${(t.floorVsPrice * 100).toFixed(0)}% vs price` : ''}</dd></div>
                <div><dt className="text-muted">Floor backs</dt><dd className="mt-0.5 font-mono text-ink">{t.floorBackingEth == null ? '—' : `${num(t.floorBackingEth, 2)} ETH`}</dd><dd className="font-mono text-[10px] text-muted">bar {bar} ETH</dd></div>
                <div><dt className="text-muted">Market cap</dt><dd className="mt-0.5 font-mono text-ink">{usd(t.mcapUsd)}</dd></div>
                <div><dt className="text-muted">24h</dt><dd className={`mt-0.5 font-mono ${t.change24h == null ? 'text-ink' : t.change24h >= 0 ? 'text-accent' : 'text-[#ff7a7a]'}`}>{t.change24h == null ? '—' : `${t.change24h >= 0 ? '+' : ''}${num(t.change24h, 1)}%`}</dd></div>
                <div><dt className="text-muted">Liquidity</dt><dd className="mt-0.5 font-mono text-ink">{usd(t.liquidityUsd)}</dd></div>
                <div><dt className="text-muted">Circulating</dt><dd className="mt-0.5 font-mono text-ink">{t.circulating ? compact(t.circulating) : '—'}</dd><dd className="font-mono text-[10px] text-muted">of {t.supply ? compact(t.supply) : '—'}</dd></div>
                <div><dt className="text-muted">Launched</dt><dd className="mt-0.5 text-ink">{when(t.launchedAt)}</dd></div>
                <div><dt className="text-muted">Age</dt><dd className="mt-0.5 text-ink">{ago(t.ageSec)}</dd></div>
              </dl>

              <dl className="grid gap-1.5 border-t border-white/[0.06] pt-3 text-xs">
                <div className="flex items-center justify-between gap-2"><dt className="text-muted">Token</dt><dd className="flex items-center gap-2"><CopyAddr value={t.address} /><a href={t.links.token} target="_blank" rel="noreferrer" className="text-muted hover:text-ink" title="Explorer"><ArrowUpRight size={12} /></a></dd></div>
                <div className="flex items-center justify-between gap-2"><dt className="text-muted">Creator</dt><dd className="flex items-center gap-2"><CopyAddr value={t.creator} /><a href={t.links.creator} target="_blank" rel="noreferrer" className="text-muted hover:text-ink" title="Explorer"><ArrowUpRight size={12} /></a></dd></div>
                <div className="flex items-center justify-between gap-2"><dt className="text-muted">Launch tx</dt><dd><a href={t.links.launchTx} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-muted hover:text-ink">{shortAddr(t.launchTx)} <ArrowUpRight size={12} /></a></dd></div>
              </dl>

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <a href={t.links.fobo} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-ink">FOBO <ArrowUpRight size={11} /></a>
                <a href={t.links.dexscreener} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-ink">DexScreener <ArrowUpRight size={11} /></a>
                <a href={t.links.token} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-ink">Explorer <ArrowUpRight size={11} /></a>
              </div>

              <div className="mt-auto flex items-center gap-2">
                {t.kyte === 'listed' ? (
                  <>
                    <PillButton href={`/sell?kind=put&token=${encodeURIComponent(t.symbol)}&expiry=86400`} tone="premium" size="sm">Sell a 24h put</PillButton>
                    <Link href={`/market?token=${encodeURIComponent(t.symbol)}`} className="btn btn-glass btn-glass-sm">Market</Link>
                  </>
                ) : (
                  <a href={t.links.fobo} target="_blank" rel="noreferrer" className="btn btn-glass btn-glass-sm">Trade on FOBO <ArrowUpRight size={12} /></a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10"><Note>FOBO tokens launch with their whole supply as Uniswap v4 liquidity and a floor that only rises. Kyte lists an ETH-quoted FOBO token once it is a day old and its floor backs {bar} ETH for the tokens in circulation, and only allows options that expire within 24 hours on it. The floor bounds a put writer&apos;s loss: the price cannot close below it, so a put struck at or below the floor can never finish in the money and Kyte refuses to list one. Options are risky and can expire worthless.</Note></div>
    </>
  )
}
