import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Receiver for Harmonic Agent's Session Signal webhooks (halt, reopen, close, weekend mark on a stock token).
 * Harmonic signs every call: `x-harmonic-signature: v1=<hex>` is HMAC-SHA256 over `<x-harmonic-timestamp>.<raw body>`
 * with the subscription's secret. We verify here, then relay the event to the indexer (a private service) so it
 * refreshes its session rows at once instead of at the next 5 minute poll. docs/HARMONIC.md.
 *
 * Env: HARMONIC_WEBHOOK_SECRET (from the subscription; until it is set every call is answered 200 and ignored, so
 * Harmonic does not disable the subscription after eight failures), INDEXER_INTERNAL_URL or INDEXER_INTERNAL_HOSTPORT.
 */
export const dynamic = 'force-dynamic'

const MAX_SKEW_S = 300

function upstream(): string | null {
  const url = process.env.INDEXER_INTERNAL_URL
  if (url) return url.replace(/\/$/, '')
  const hp = process.env.INDEXER_INTERNAL_HOSTPORT
  return hp ? `http://${hp}` : null
}

export async function POST(req: NextRequest) {
  const secret = process.env.HARMONIC_WEBHOOK_SECRET
  const raw = (await req.text()).slice(0, 64 * 1024)
  if (!secret) return NextResponse.json({ ok: true, ignored: 'no secret configured' })
  const ts = req.headers.get('x-harmonic-timestamp') ?? ''
  const sig = req.headers.get('x-harmonic-signature') ?? ''
  const tsNum = Number(ts.length > 10 ? Math.floor(Number(ts) / 1000) : ts) // seconds or milliseconds
  if (!ts || !Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > MAX_SKEW_S) return NextResponse.json({ ok: false, error: 'bad timestamp' }, { status: 401 })
  const given = sig.startsWith('v1=') ? sig.slice(3).trim().toLowerCase() : ''
  const expected = createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex')
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'))) return NextResponse.json({ ok: false, error: 'bad signature' }, { status: 401 })
  let event: { type?: string; symbol?: string } = {}
  try { event = JSON.parse(raw) } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  const base = upstream()
  if (base) {
    try { await fetch(`${base}/harmonic/event`, { method: 'POST', body: JSON.stringify({ type: event.type, symbol: event.symbol }), headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000) }) } catch {}
  }
  return NextResponse.json({ ok: true })
}
