'use client'

import { ArrowUp, ArrowUpRight, Sparkle } from '@phosphor-icons/react'
import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAccount } from 'wagmi'

type Card = { tool: string; preview: string; link: string }
type Msg = { role: 'user' | 'assistant'; content: string; cards?: Card[]; tools?: string[]; error?: string }

const SUGGESTIONS = [
  'What are the best open covered calls right now?',
  'What do I hold, and what expires this week?',
  'How much has been burned, and what do stakers earn?',
  'Explain what a cash-secured put on PONS would cost me.',
]
const DISCLAIMER = 'Options are risky and can expire worthless. Information, not financial advice.'

/**
 * The chat. Talks to /api/agent over server-sent events; the model key never reaches the browser. The connected
 * wallet's address (only that) goes along so "what do I hold" works. Nothing is stored anywhere.
 */
export function AgentChat({ compact = false }: { compact?: boolean }) {
  const { address } = useAccount()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs])
  useEffect(() => () => abort.current?.abort(), [])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setInput('')
    const next: Msg[] = [...msgs, { role: 'user', content: q }, { role: 'assistant', content: '', cards: [], tools: [] }]
    setMsgs(next)
    setBusy(true)
    const ctl = new AbortController()
    abort.current = ctl
    const patch = (f: (m: Msg) => Msg) => setMsgs((cur) => cur.map((m, i) => (i === cur.length - 1 ? f(m) : m)))
    try {
      const r = await fetch('/api/agent', {
        method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(0, -1).slice(-12).map(({ role, content }) => ({ role, content })), address }),
      })
      if (!r.ok || !r.body) {
        const e = await r.json().catch(() => ({})) as { error?: string }
        patch((m) => ({ ...m, error: e.error || `Request failed (${r.status})` }))
        return
      }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i: number
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2)
          if (!line.startsWith('data: ')) continue
          const ev = JSON.parse(line.slice(6)) as { type: string; delta?: string; name?: string; status?: string; card?: Card; message?: string }
          if (ev.type === 'text') patch((m) => ({ ...m, content: m.content + ev.delta }))
          else if (ev.type === 'tool' && ev.status === 'start') patch((m) => ({ ...m, tools: [...(m.tools ?? []), ev.name!] }))
          else if (ev.type === 'card') patch((m) => ({ ...m, cards: [...(m.cards ?? []), ev.card!] }))
          else if (ev.type === 'error') patch((m) => ({ ...m, error: ev.message }))
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) patch((m) => ({ ...m, error: 'Connection lost.' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${compact ? '' : 'card'}`}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5" data-lenis-prevent>
        {msgs.length === 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted"><Sparkle size={16} className="text-accent" /> Ask about markets, offers, prices, staking or proof. Answers come from live on-chain data.</div>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="hair rounded-xl border px-3.5 py-2.5 text-left text-sm text-ink/80 transition-colors hover:bg-white/[0.04] hover:text-ink">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.08] px-4 py-2.5 text-sm text-ink">{m.content}</div>
            ) : (
              <div className="space-y-3">
                {m.tools && m.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.tools.map((t, j) => <span key={j} className="hair rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{t.replace(/_/g, ' ')}</span>)}
                  </div>
                )}
                {m.content ? <Markdown text={m.content} /> : !m.error && <span className="inline-flex gap-1 text-muted"><Dot /><Dot d={0.15} /><Dot d={0.3} /></span>}
                {m.cards?.map((c, j) => (
                  <div key={j} className="panel rounded-xl p-4">
                    <div className="eyebrow !text-[10px]">Review and sign in your wallet</div>
                    <p className="mt-2 text-sm text-ink/85">{c.preview}</p>
                    <a href={c.link} className="btn btn-accent btn-sm mt-3">Open on kyte.sh <ArrowUpRight size={14} /></a>
                  </div>
                ))}
                {m.error && <div className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{m.error}</div>}
              </div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="hair border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            rows={1}
            placeholder={address ? 'Ask about markets, your positions, staking…' : 'Ask about markets, offers, staking… (connect a wallet for your positions)'}
            className="input min-h-11 flex-1 resize-none py-2.5 font-sans"
            maxLength={2000}
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="btn btn-accent grid size-11 shrink-0 place-items-center !p-0"><ArrowUp size={16} /></button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-faint">
          <span>{DISCLAIMER}</span>
          {!compact && <Link href="/docs" className="lnk shrink-0">How it works</Link>}
        </div>
      </form>
    </div>
  )
}

function Dot({ d = 0 }: { d?: number }) {
  return <span className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}s` }} />
}

/** Tiny safe Markdown: paragraphs, bullet lists, pipe tables, bold, inline code and links. No HTML is ever injected. */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim()) { i++; continue }
    if (l.trim().startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); i++ }
      const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)))
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto"><table className="w-full text-xs">
          <thead><tr>{body[0]?.map((c, k) => <th key={k} className="label px-2 py-1.5 text-left font-normal">{c}</th>)}</tr></thead>
          <tbody>{body.slice(1).map((r, k) => <tr key={k} className="border-t border-line/60">{r.map((c, j) => <td key={j} className="px-2 py-1.5 align-top"><Inline s={c} /></td>)}</tr>)}</tbody>
        </table></div>,
      )
      continue
    }
    if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s/, '')); i++ }
      blocks.push(<ul key={blocks.length} className="list-disc space-y-1 pl-5 text-sm text-ink/85">{items.map((it, k) => <li key={k}><Inline s={it} /></li>)}</ul>)
      continue
    }
    if (/^#{1,3}\s/.test(l)) { blocks.push(<div key={blocks.length} className="text-sm font-medium text-ink">{l.replace(/^#{1,3}\s/, '')}</div>); i++; continue }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('|') && !/^\s*([-*]|\d+\.)\s/.test(lines[i]) && !/^#{1,3}\s/.test(lines[i])) { para.push(lines[i]); i++ }
    blocks.push(<p key={blocks.length} className="text-sm leading-relaxed text-ink/85"><Inline s={para.join(' ')} /></p>)
  }
  return <div className="space-y-3">{blocks}</div>
}

function Inline({ s }: { s: string }) {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s)]+)/g
  let last = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) out.push(<strong key={k++} className="text-ink">{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k++} className="rounded bg-white/[0.06] px-1 font-mono text-[12px]">{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) { const label = t.slice(1, t.indexOf(']')); out.push(<a key={k++} href={m[2]} className="text-accent hover:underline" target={m[2].startsWith(location.origin) ? undefined : '_blank'} rel="noreferrer">{label}</a>) }
    else out.push(<a key={k++} href={t} className="text-accent hover:underline" rel="noreferrer">{t.replace(/^https?:\/\//, '')}</a>)
    last = m.index + t.length
  }
  if (last < s.length) out.push(s.slice(last))
  return <>{out}</>
}
