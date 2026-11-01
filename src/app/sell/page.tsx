'use client'

import { useMemo, useState } from 'react'
import { parseEther, parseUnits } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import { TokenChart } from '@/components/TokenChart'
import { TxStatus } from '@/components/TxStatus'
import { WalletHoldings } from '@/components/WalletHoldings'
import { Note, PageHeader, Segmented } from '@/components/ui'
import { contracts } from '@/lib/chains'
import { FEES, LIMITS } from '@/lib/config'
import { useAssets, useBalances, useLive, type Kind } from '@/lib/data'
import { eth, num } from '@/lib/format'
import { ABIS } from '@/lib/generated/abis'
import { blackScholes } from '@/lib/pricing'
import { approvalIfNeeded, useTx } from '@/lib/tx'

const DURATIONS = [
  { label: '1 day', sec: 86400 }, { label: '3 days', sec: 3 * 86400 }, { label: '1 week', sec: 7 * 86400 },
  { label: '2 weeks', sec: 14 * 86400 }, { label: '30 days', sec: 30 * 86400 }, { label: '90 days', sec: 90 * 86400 },
]
const FILL_WINDOWS = [
  { label: '6 hours', sec: 6 * 3600 }, { label: '1 day', sec: 86400 }, { label: '3 days', sec: 3 * 86400 }, { label: 'Until expiry', sec: Infinity },
]

export default function SellPage() {
  const { address, isConnected } = useAccount()
  const client = usePublicClient()
  const live = useLive()
  const tx = useTx()
  const assetsQ = useAssets()
  const balances = useBalances()
  const [kind, setKind] = useState<Kind>('call')
  const [symbol, setSymbol] = useState('')
  const [amount, setAmount] = useState('100000')
  const [strikePer, setStrikePer] = useState('')
  const [premium, setPremium] = useState('')
  const [durationSec, setDurationSec] = useState(DURATIONS[2].sec)
  const [fillSec, setFillSec] = useState(FILL_WINDOWS[1].sec)

  const assets = (assetsQ.data ?? []).filter((a) => a.enabled && (kind === 'put' ? a.putsEnabled : true))
  const a = assets.find((x) => x.symbol === symbol) ?? assets[0]
  const amt = Number(amount) || 0
  const strikeEach = Number(strikePer) || (a?.spotEth ? a.spotEth * (kind === 'call' ? 1.2 : 0.85) : 0)
  const totalStrike = amt * strikeEach
  const suggested = useMemo(
    () => (a ? amt * blackScholes({ spot: a.spotEth, strike: strikeEach, years: durationSec / (365 * 86400), vol: a.vol, kind }) : 0),
    [amt, a, strikeEach, durationSec, kind],
  )
  const prem = premium === '' ? suggested : Number(premium) || 0
  const premiumFee = (prem * FEES.premiumBps) / 10_000
  const exerciseFee = (totalStrike * FEES.exerciseBps) / 10_000
  const fillBy = Math.min(fillSec, durationSec)
  const myTokens = a ? balances.data?.tokens[a.symbol] : undefined

  // Mirrors the contract checks (SPEC.md §3.3) so users see the reason before signing.
  const errors: string[] = []
  if (!a) errors.push('No token available for this market.')
  if (amt <= 0) errors.push('Amount must be above zero.')
  if (strikeEach <= 0) errors.push('Enter a strike per token.')
  if (prem < LIMITS.minPremiumEth) errors.push(`Premium must be at least ${LIMITS.minPremiumEth} ETH.`)
  if (durationSec < LIMITS.minDurationSec || durationSec > LIMITS.maxDurationSec) errors.push('Expiry must be 1 hour to 90 days away.')
  if (kind === 'call' && live && myTokens !== undefined && amt > myTokens) errors.push(`You hold ${num(myTokens, 0)} ${a?.symbol}.`)
  if (kind === 'put' && live && balances.data && totalStrike > balances.data.eth) errors.push(`You need ${eth(totalStrike)} in your wallet to lock.`)

  const submit = async () => {
    if (!a || !client || !address) return
    const now = Math.floor(Date.now() / 1000)
    const expiry = BigInt(now + durationSec)
    const deadline = BigInt(now + fillBy)
    const amountRaw = parseUnits(amt.toString(), a.decimals)
    const strikeRaw = parseEther(totalStrike.toFixed(18))
    const premiumRaw = parseEther(prem.toFixed(18))
    const ok =
      kind === 'call'
        ? await tx.run([
            ...(await approvalIfNeeded(client, address, a.address, contracts.callMarket!, amountRaw, `Approve ${a.symbol}`)),
            { label: `Lock ${num(amt, 0)} ${a.symbol} and list the call`, address: contracts.callMarket!, abi: ABIS.CallMarket, functionName: 'createOffer', args: [a.address, amountRaw, strikeRaw, premiumRaw, expiry, deadline] },
          ])
        : await tx.run([
            { label: `Lock ${eth(totalStrike)} and list the put`, address: contracts.router!, abi: ABIS.Router, functionName: 'createPutOfferWithETH', args: [a.address, amountRaw, strikeRaw, premiumRaw, expiry, deadline], value: strikeRaw },
          ])
    if (ok) { setPremium(''); setStrikePer('') }
  }

  // Nothing listed yet (the market opens when the timelock executes): show that, not a form with no token.
  if (assetsQ.isSuccess && (assetsQ.data?.length ?? 0) === 0) {
    return (
      <>
        <PageHeader title="Sell an option" sub="Your collateral is locked until the option is exercised, expires, or you cancel an unfilled offer." />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="card p-8 lg:col-span-3">
            <div className="label">Market not open yet</div>
            <h2 className="mt-3 text-2xl">No token is listed for options yet.</h2>
            <p className="mt-3 text-muted">
              The contracts are live on {live ? 'Robinhood Chain' : 'this network'}. Listings go through the protocol timelock: the admin Safe schedules them, and they take effect once the
              delay has passed. As soon as a token is listed, this page turns into the sell form.
            </p>
            <p className="mt-3 text-sm text-faint">Meanwhile you can check your balances on the right, and the Proof and Docs pages list every contract address.</p>
          </div>
          <aside className="space-y-4 lg:col-span-2"><WalletHoldings /></aside>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Sell an option" sub="Your collateral is locked until the option is exercised, expires, or you cancel an unfilled offer." />

      <div className="grid gap-6 lg:grid-cols-5">
        <form className="card space-y-6 p-6 lg:col-span-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <Segmented value={kind} onChange={(k) => { setKind(k); setStrikePer(''); setPremium('') }} options={[{ value: 'call', label: 'Covered call' }, { value: 'put', label: 'Cash-secured put' }]} />

          <Field label="Token">
            <select className="input" value={a?.symbol ?? ''} onChange={(e) => { setSymbol(e.target.value); setStrikePer(''); setPremium('') }}>
              {assets.map((x) => <option key={x.symbol} value={x.symbol}>{x.symbol}: {x.name}</option>)}
            </select>
            <Hint>
              {a?.spotEth ? <>Spot ≈ {a.spotEth.toPrecision(3)} ETH. </> : null}
              {myTokens !== undefined && <>You hold {num(myTokens, 0)} {a?.symbol}. </>}
              Only listed tokens can be used.
            </Hint>
          </Field>

          <Field label={`Amount (${a?.symbol ?? ''})`}>
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Hint>{kind === 'call' ? `You lock ${num(amt, 0)} ${a?.symbol}.` : `Buyer may sell you ${num(amt, 0)} ${a?.symbol}.`}</Hint>
          </Field>

          <Field label="Strike per token (ETH)">
            <input className="input" inputMode="decimal" placeholder={strikeEach ? strikeEach.toPrecision(3) : '0.0001'} value={strikePer} onChange={(e) => setStrikePer(e.target.value)} />
            <Hint>
              {a?.spotEth ? <>{num((strikeEach / a.spotEth - 1) * 100, 0)}% vs spot · </> : null}
              total strike {eth(totalStrike)}{kind === 'put' && <> · you lock {eth(totalStrike)}</>}
            </Hint>
          </Field>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Expires in">
              <select className="input" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))}>
                {DURATIONS.map((d) => <option key={d.sec} value={d.sec}>{d.label}</option>)}
              </select>
            </Field>
            <Field label="Offer can be filled for">
              <select className="input" value={fillSec} onChange={(e) => setFillSec(Number(e.target.value))}>
                {FILL_WINDOWS.map((d) => <option key={d.label} value={d.sec}>{d.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Premium (total, ETH)">
            <input className="input" inputMode="decimal" placeholder={suggested ? suggested.toPrecision(3) : '0.01'} value={premium} onChange={(e) => setPremium(e.target.value)} />
            <Hint>{suggested > 0 ? <>Suggested {eth(suggested, 6)} (Black-Scholes, {num((a?.vol ?? 0) * 100, 0)}% vol). A hint only.</> : 'Set the price a buyer pays you up front.'}</Hint>
          </Field>

          {errors.length > 0 && <Note tone="warn">{errors.map((e) => <div key={e}>{e}</div>)}</Note>}

          <button type="submit" className="btn btn-accent h-12 w-full" disabled={!isConnected || !live || errors.length > 0 || tx.busy}>
            {!isConnected ? 'Connect a wallet to sell' : !live ? 'Demo mode' : tx.busy ? 'Working…' : kind === 'call' ? `Approve & lock ${num(amt, 0)} ${a?.symbol}` : `Lock ${eth(totalStrike)}`}
          </button>
        </form>

        <aside className="space-y-4 lg:col-span-2">
          <WalletHoldings />
          {a && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <span className="label">{a.symbol} · Uniswap v4</span>
                <span className="font-mono text-xs text-muted">{a.spotEth ? `${a.spotEth.toPrecision(4)} ETH` : 'no price feed'}</span>
              </div>
              <TokenChart symbol={a.symbol} interval={300} height={200} showMarkers={false} lines={strikeEach > 0 ? [{ price: strikeEach, title: 'your strike', color: kind === 'call' ? '#4dfca9' : '#05edfa' }] : []} />
            </div>
          )}
          <div className="card p-6">
            <div className="label">Summary</div>
            <dl className="mt-4 space-y-3 text-sm">
              <Row k="You lock" v={kind === 'call' ? `${num(amt, 0)} ${a?.symbol ?? ''}` : eth(totalStrike)} />
              <Row k="Premium if filled" v={eth(prem, 6)} />
              <Row k={`Premium fee (${FEES.premiumBps / 100}%)`} v={`−${eth(premiumFee, 6)}`} />
              <Row k="You receive when filled" v={eth(prem - premiumFee, 6)} strong />
              <div className="border-t border-line" />
              <Row k="If exercised you receive" v={kind === 'call' ? eth(totalStrike - exerciseFee, 6) : `${num(amt, 0)} ${a?.symbol ?? ''}`} />
              {kind === 'call' && <Row k={`Exercise fee (${FEES.exerciseBps / 100}%)`} v={`−${eth(exerciseFee, 6)}`} />}
              <Row k="If it expires" v={kind === 'call' ? `${num(amt, 0)} ${a?.symbol ?? ''} back` : `${eth(totalStrike)} back`} />
              <Row k="Fill window" v={fillBy === durationSec ? 'until expiry' : `${fillBy / 3600} h`} />
            </dl>
          </div>
          <Note>
            {kind === 'call'
              ? 'If the price ends above your strike, the buyer will likely exercise and you sell your tokens at the strike. You keep the premium either way.'
              : 'If the price ends below your strike, the buyer will likely exercise and you buy their tokens at the strike. You keep the premium either way.'}
          </Note>
          <Note>Payouts arrive as WETH. Unwrap to ETH on the Positions page.</Note>
        </aside>
      </div>
      <TxStatus state={tx.state} onClose={tx.reset} />
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label mb-2 block">{label}</span>{children}</label>
}
function Hint({ children }: { children: React.ReactNode }) {
  return <span className="mt-1.5 block text-xs text-faint">{children}</span>
}
function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className={`tabular text-right font-mono ${strong ? 'font-semibold text-accent' : ''}`}>{v}</dd>
    </div>
  )
}
