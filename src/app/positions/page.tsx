'use client'

import { useState } from 'react'
import { parseEther } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import { TimeLeft } from '@/components/TimeLeft'
import { TxStatus } from '@/components/TxStatus'
import { KindBadge, Note, PageHeader, Segmented } from '@/components/ui'
import { contracts } from '@/lib/chains'
import { useBalances, useLive, usePositions, type Offer } from '@/lib/data'
import { eth, num } from '@/lib/format'
import { ABIS } from '@/lib/generated/abis'
import { approvalIfNeeded, useTx } from '@/lib/tx'

type Tab = 'holding' | 'selling' | 'history'

export default function PositionsPage() {
  const { address, isConnected } = useAccount()
  const client = usePublicClient()
  const live = useLive()
  const [tab, setTab] = useState<Tab>('holding')
  const pos = usePositions()
  const balances = useBalances()
  const tx = useTx()
  const rows = tab === 'holding' ? pos.holding : tab === 'selling' ? pos.selling : pos.history
  const now = Date.now() / 1000

  const market = (o: Offer) => (o.kind === 'call' ? { address: contracts.callMarket!, abi: ABIS.CallMarket } : { address: contracts.putMarket!, abi: ABIS.PutMarket })

  const settle = async (o: Offer) => {
    if (o.kind === 'call') {
      await tx.run([{ label: `Settle: pay ${eth(o.strike)} for ${num(o.amount, 0)} ${o.symbol}`, address: contracts.router!, abi: ABIS.Router, functionName: 'exerciseWithETH', args: [o.id], value: o.strikeRaw }])
    } else if (client && address) {
      await tx.run([
        ...(await approvalIfNeeded(client, address, o.token, contracts.putMarket!, o.amountRaw, `Approve ${o.symbol}`)),
        { label: `Settle: deliver ${num(o.amount, 0)} ${o.symbol} for ${eth(o.strike)}`, address: contracts.putMarket!, abi: ABIS.PutMarket, functionName: 'exercisePut', args: [o.id] },
      ])
    }
  }
  const cancel = (o: Offer) => tx.run([{ label: 'Cancel offer and reclaim collateral', ...market(o), functionName: 'cancelUnfilled', args: [o.id] }])
  const expire = (o: Offer) => tx.run([{ label: 'Expire and reclaim collateral', ...market(o), functionName: 'expire', args: [o.id] }])
  const unwrap = () => {
    const amt = balances.data?.weth ?? 0
    return tx.run([{ label: `Unwrap ${eth(amt)} WETH to ETH`, address: contracts.weth!, abi: ABIS.WETH, functionName: 'withdraw', args: [parseEther(amt.toFixed(18))] }])
  }

  return (
    <>
      <PageHeader title="Positions" sub="Options you hold and offers you've written.">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'holding', label: `Holding (${pos.holding.length})` }, { value: 'selling', label: `Selling (${pos.selling.length})` }, { value: 'history', label: 'History' }]} />
      </PageHeader>

      {!isConnected ? (
        <div className="card p-16 text-center text-muted">Connect a wallet to see your positions.</div>
      ) : (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex flex-wrap gap-8">
              <div><div className="label">ETH</div><div className="mt-1 font-mono text-xl font-semibold tabular">{eth(balances.data?.eth ?? 0)}</div></div>
              <div><div className="label">WETH (payouts)</div><div className="mt-1 font-mono text-xl font-semibold tabular">{eth(balances.data?.weth ?? 0)}</div></div>
            </div>
            <button className="btn btn-ghost" disabled={!live || tx.busy || !(balances.data?.weth ?? 0)} onClick={unwrap}>Unwrap WETH → ETH</button>
          </div>

          <div className="card divide-y divide-line">
            {rows.map((o) => {
              const expired = o.expiry <= now
              const stale = o.status === 'open' && o.offerDeadline < now
              let action: { label: string; primary?: boolean; run?: () => unknown } | null = null
              if (tab === 'holding') action = expired ? { label: 'Expired' } : { label: 'Settle', primary: true, run: () => settle(o) }
              else if (o.status === 'open') action = { label: stale ? 'Reclaim' : 'Cancel', primary: stale, run: () => cancel(o) }
              else if (o.status === 'filled' && expired) action = { label: 'Expire & reclaim', primary: true, run: () => expire(o) }
              const status =
                o.status === 'open' ? (stale ? 'Not filled: reclaim your collateral' : 'Waiting for a buyer')
                : o.status === 'filled' ? (tab === 'holding' ? 'You hold this option' : 'Sold: collateral locked')
                : o.status === 'exercised' ? 'settled' : o.status
              return (
                <div key={o.id.toString()} className="flex flex-wrap items-center gap-4 p-5">
                  <KindBadge kind={o.kind} />
                  <div className="min-w-40 flex-1">
                    <div className="font-mono font-medium">{num(o.amount, 0)} {o.symbol} @ {eth(o.strike)}</div>
                    <div className={`text-xs ${stale ? 'text-warn' : 'text-faint'}`}>{status}</div>
                  </div>
                  <div className="w-28 text-sm"><div className="label">Premium</div><div className="tabular font-mono">{eth(o.premium)}</div></div>
                  <div className="w-24 text-sm"><div className="label">Expires</div><TimeLeft at={o.expiry} /></div>
                  {action && (
                    <button className={`btn btn-sm ${action.primary ? 'btn-primary' : 'btn-ghost'}`} disabled={!live || tx.busy || !action.run} onClick={action.run}>
                      {action.label}
                    </button>
                  )}
                </div>
              )
            })}
            {rows.length === 0 && (
              <div className="p-16 text-center text-muted">{pos.isLoading ? 'Loading…' : tab === 'holding' ? 'You don’t hold any options.' : tab === 'selling' ? 'You have no open offers.' : 'Nothing settled yet.'}</div>
            )}
          </div>

          <Note tone="warn">Settling close to expiry is risky: if your transaction lands after expiry it fails, and the collateral goes back to the seller.</Note>
        </div>
      )}
      <TxStatus state={tx.state} onClose={tx.reset} />
    </>
  )
}
