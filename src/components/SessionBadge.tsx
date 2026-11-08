import type { Session } from '@/lib/data'

const LABEL: Record<Session['state'], string | null> = {
  open: null,
  held: 'Weekend hold',
  halted: 'Halted',
  paused: 'Paused',
  stale: 'Stale quote',
  unknown: 'No session read',
}

/**
 * Small pill beside a stock-token price when the stock behind it is not trading: halted, paused for a corporate
 * action, in its weekend hold, or the quote is stale. Nothing is rendered while the session is open or unknown to
 * us (crypto tokens have no session). State comes from Harmonic Agent's session oracle through the indexer.
 */
export function SessionBadge({ session, className = '' }: { session?: Session | null; className?: string }) {
  const label = session ? LABEL[session.state] : null
  if (!label) return null
  const warn = session!.state === 'halted' || session!.state === 'paused'
  return (
    <span
      title={session!.why ?? undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${
        warn ? 'border-danger/40 bg-danger/10 text-danger' : 'border-warn/40 bg-warn/10 text-warn'
      } ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${warn ? 'bg-danger' : 'bg-warn'}`} />
      {label}
    </span>
  )
}

/** One sentence for a hint line: why the spot shown may not be live, with the weekend mark when there is one. */
export function sessionSentence(session?: Session | null): string | null {
  if (!session || session.state === 'open') return null
  const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (session.state === 'held') {
    const until = session.until ? new Date(session.until * 1000).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : null
    const mark = session.weekendMarkUsd
      ? ` On chain it has traded at about ${usd(session.weekendMarkUsd)} this weekend${session.offFridayBps != null ? ` (${session.offFridayBps > 0 ? '+' : ''}${(session.offFridayBps / 100).toFixed(2)}% from Friday)` : ''}.`
      : ''
    return `Spot is Friday's print: the stock is in its weekend hold${until ? ` until ${until}` : ''}.${mark}`
  }
  if (session.state === 'halted') return 'Trading in the stock is halted; the spot shown is the last print before the halt and may be stale.'
  if (session.state === 'paused') return 'The token is paused for a corporate action; the spot shown may not apply after it.'
  if (session.state === 'stale') return 'The quote behind this spot is stale; the issuer has not printed recently.'
  return 'The session behind this token could not be read; treat the spot with care.'
}
