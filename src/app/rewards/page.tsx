'use client'

import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { TxStatus } from '@/components/TxStatus'
import { Note, PageHeader, Stat } from '@/components/ui'
import { contracts } from '@/lib/chains'
import { USDG } from '@/lib/config'
import { useLive, useRewards, useRewardsProgram, type RewardEpoch } from '@/lib/data'
import { date, num } from '@/lib/format'
import { ABIS } from '@/lib/generated/abis'
import { useTx } from '@/lib/tx'

const usdg = (n: number) => `${num(n, n >= 100 ? 0 : 2)} USDG`
const pct = (x: number) => `${(x * 100).toFixed(x >= 0.1 ? 1 : 2)}%`
const day = (endsAt: number) => date(endsAt - 86_400)
const WHAT: Record<string, string> = { bought: 'bought options', wrote_call: 'wrote calls', wrote_put: 'wrote puts', held: 'held open interest' }

export default function RewardsPage() {
  const { isConnected } = useAccount()
  const live = useLive()
  const tx = useTx()
  const program = useRewardsProgram()
  const mine = useRewards()
  const p = program.data
  const m = mine.data
  const rewardsAddr = contracts.usdgRewards
  const deployed = Boolean(rewardsAddr)

  const claimable = useMemo(() => (m?.claimable ?? []).filter((e) => e.amountUsdg > 0), [m])
  const claim = (epochs: RewardEpoch[]) => {
    if (!rewardsAddr || !m || !epochs.length) return
    if (epochs.length === 1) {
      const e = epochs[0]
      return tx.run([{ label: `Claim ${usdg(e.amountUsdg)} (epoch ${e.epoch})`, address: rewardsAddr, abi: ABIS.UsdgRewards, functionName: 'claim', args: [BigInt(e.epoch), m.account as `0x${string}`, BigInt(e.amount), e.proof] }])
    }
    return tx.run([{ label: `Claim ${usdg(epochs.reduce((s, e) => s + e.amountUsdg, 0))} (${epochs.length} epochs)`, address: rewardsAddr, abi: ABIS.UsdgRewards, functionName: 'claimMany', args: [epochs.map((e) => BigInt(e.epoch)), m.account as `0x${string}`, epochs.map((e) => BigInt(e.amount)), epochs.map((e) => e.proof)] }])
  }

  return (
    <>
      <PageHeader title="USDG rewards" sub="Every 24 hour epoch pays a pool of USDG to the wallets that traded on Kyte, split by the fees they actually paid. Buy an option, write one, or keep a position open, and you earn a share. Claims are signed in your wallet and never pause." />

      {!live && <div className="mb-6"><Note>Demo mode: rewards read from the live indexer only.</Note></div>}
      {live && p && !deployed && <div className="mb-6"><Note>Points are being scored now. Payouts start once the rewards contract is deployed and the ops Safe funds it. Your points carry over: every scored epoch is paid when its root is published.</Note></div>}
      {live && p && deployed && p.poolUsdg <= 0 && <div className="mb-6"><Note>Points are being scored, but this epoch&apos;s pool is 0 USDG. The ops Safe sets the pool per epoch.</Note></div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="This epoch's pool" value={p ? usdg(p.current.poolUsdg) : '…'} hint={p ? `epoch #${p.current.epoch} · ends ${date(p.current.endsAt)}` : undefined} />
        <Stat label="Your points this epoch" value={m ? num(m.current.points, 2) : isConnected ? '…' : '—'} hint={m && p && p.current.totalPoints > 0 ? `${pct(m.current.share)} of ${num(p.current.totalPoints, 0)}` : m ? 'no fees paid yet this epoch' : 'connect a wallet'} />
        <Stat label="Estimated this epoch" value={m ? usdg(m.current.estimatedUsdg) : '—'} hint="moves until the epoch ends" />
        <Stat label="Claimable now" value={m ? usdg(m.claimableUsdg) : '—'} hint={m ? `${usdg(m.claimedUsdg)} claimed so far` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="card p-6 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-ink">Your epochs</h2>
            {claimable.length > 1 && <button className="btn btn-accent btn-sm" disabled={tx.busy} onClick={() => claim(claimable)}>Claim all · {usdg(claimable.reduce((s, e) => s + e.amountUsdg, 0))}</button>}
          </div>
          {!isConnected ? (
            <p className="mt-4 text-sm text-muted">Connect a wallet to see your points and claims.</p>
          ) : !m ? (
            <p className="mt-4 text-sm text-muted">Loading…</p>
          ) : m.epochs.length === 0 && m.current.points === 0 ? (
            <p className="mt-4 text-sm text-muted">No fees paid yet. Buy or write an option on the <a href="/market" className="text-accent hover:underline">market</a> and your points show up here within a minute.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-line text-left">{['Epoch', 'Points', 'Share', 'USDG', 'Status', ''].map((h) => <th key={h} className="label px-3 py-2 font-normal">{h}</th>)}</tr></thead>
                <tbody>
                  {m.current.points > 0 && (
                    <tr className="border-b border-line/60">
                      <td className="px-3 py-3 text-ink">{day(m.current.endsAt)} <span className="text-faint">· live</span></td>
                      <td className="px-3 py-3 font-mono tabular">{num(m.current.points, 2)}</td>
                      <td className="px-3 py-3 font-mono tabular">{pct(m.current.share)}</td>
                      <td className="px-3 py-3 font-mono tabular">≈ {num(m.current.estimatedUsdg, 2)}</td>
                      <td className="px-3 py-3 text-muted">scoring</td>
                      <td />
                    </tr>
                  )}
                  {m.epochs.map((e) => (
                    <tr key={e.epoch} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-3 text-ink" title={Object.entries(e.detail).map(([k, v]) => `${WHAT[k] ?? k}: ${num(v, 2)}`).join(' · ')}>{day(e.endsAt)}</td>
                      <td className="px-3 py-3 font-mono tabular">{num(e.points, 2)}</td>
                      <td className="px-3 py-3 font-mono tabular">{pct(e.share)}</td>
                      <td className="px-3 py-3 font-mono tabular">{e.amountUsdg > 0 ? num(e.amountUsdg, 2) : '—'}</td>
                      <td className={`px-3 py-3 ${e.status === 'claimable' ? 'text-accent' : e.status === 'claimed' ? 'text-ink' : 'text-muted'}`}>{e.status === 'dust' ? 'below 0.01' : e.status === 'pending' ? (deployed ? 'root not published yet' : 'awaiting funding') : e.status}{e.status === 'claimable' && e.expiresAt ? <span className="text-faint"> · until {date(e.expiresAt)}</span> : null}</td>
                      <td className="px-3 py-3 text-right">{e.status === 'claimable' && <button className="btn btn-accent btn-sm" disabled={tx.busy} onClick={() => claim([e])}>Claim</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4"><TxStatus state={tx.state} onClose={tx.reset} /></div>
        </div>

        <aside className="space-y-4 lg:col-span-2">
          <div className="card p-5">
            <div className="label">How points work</div>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><span className="text-ink">Buy an option</span>: 1 point per 0.0001 ETH of the fee on the premium.</li>
              <li><span className="text-ink">Write an option</span> that fills: the same points as its buyer.</li>
              <li><span className="text-ink">Write a cash-secured put on a stock token</span>: 1.5× for the writer.</li>
              <li><span className="text-ink">Keep a position open</span> through an epoch end: 0.2× its fee, to both sides, every epoch.</li>
              <li>The pool splits pro rata. Shares below {p ? num(p.rules.minClaimUsdg, 2) : '0.01'} USDG are not paid. Claims stay open {deployed ? '90 days' : 'for a fixed window'} after a root is published.</li>
            </ul>
            <p className="mt-3 text-xs text-faint">Points come from fees paid on chain, so there is nothing to farm for free: a wash trade costs the full fee. Every epoch&apos;s tree is public at <code>/api/indexer/rewards/epoch/&lt;n&gt;</code>.</p>
          </div>
          <div className="card p-5">
            <div className="label">Program</div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted">Token</dt><dd className="font-mono text-ink">{USDG.symbol}</dd>
              <dt className="text-muted">Contract</dt><dd className="font-mono text-xs text-ink">{rewardsAddr ? `${rewardsAddr.slice(0, 8)}…${rewardsAddr.slice(-4)}` : 'not deployed yet'}</dd>
              <dt className="text-muted">Funded, unowed</dt><dd className="font-mono text-ink">{p?.availableUsdg == null ? '—' : usdg(p.availableUsdg)}</dd>
              <dt className="text-muted">Scored epochs</dt><dd className="font-mono text-ink">{p ? p.epochs.length : '…'}</dd>
            </dl>
          </div>
          {p && p.epochs.length > 0 && (
            <div className="card overflow-hidden">
              <div className="border-b border-line px-5 py-3 label">Recent epochs</div>
              <table className="w-full text-xs">
                <tbody>
                  {p.epochs.slice(0, 10).map((e) => (
                    <tr key={e.epoch} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-2 text-ink">{day(e.endsAt)}</td>
                      <td className="px-2 py-2 font-mono tabular text-muted">{e.participants} wallets</td>
                      <td className="px-2 py-2 font-mono tabular text-ink">{e.totalUsdg > 0 ? usdg(e.totalUsdg) : `${num(e.totalPoints, 0)} pts`}</td>
                      <td className={`px-5 py-2 text-right ${e.status === 'claimable' ? 'text-accent' : 'text-muted'}`}>{e.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </aside>
      </div>

      <div className="mt-10"><Note>Rewards are paid by the Kyte ops Safe from protocol revenue and treasury; the pool per epoch can change or stop. USDG is issued by Paxos. Options are risky and can expire worthless; rewards do not change that.</Note></div>
    </>
  )
}
