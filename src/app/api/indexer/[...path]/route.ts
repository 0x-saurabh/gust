import { NextResponse, type NextRequest } from 'next/server'

/**
 * Same-origin gateway to the indexer, for hosts where the indexer is a private service (Render: a pserv reachable
 * only on the internal network). Set NEXT_PUBLIC_INDEXER_URL=/api/indexer and INDEXER_INTERNAL_URL (or
 * INDEXER_INTERNAL_HOSTPORT) on the web service. Read-only: GET only, known routes only, no cookies forwarded.
 */
const ALLOWED = /^(health|assets|offers|activity|prices|candles|markers|expirable|proof|stats|positions\/0x[0-9a-fA-F]{40}|stake\/0x[0-9a-fA-F]{40}|offers\/\d{1,80})$/

function upstream(): string | null {
  const url = process.env.INDEXER_INTERNAL_URL
  if (url) return url.replace(/\/$/, '')
  const hp = process.env.INDEXER_INTERNAL_HOSTPORT
  return hp ? `http://${hp}` : null
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const base = upstream()
  if (!base) return NextResponse.json({ error: 'indexer not configured' }, { status: 503 })
  const sub = (await params).path.join('/')
  if (!ALLOWED.test(sub)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const qs = req.nextUrl.search.length <= 512 ? req.nextUrl.search : ''
  try {
    const r = await fetch(`${base}/${sub}${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: { 'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '' } })
    const body = await r.text()
    return new NextResponse(body, { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'indexer unavailable' }, { status: 502 })
  }
}
