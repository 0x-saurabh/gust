'use client'

import { ArrowUpRight, Check, Copy } from '@phosphor-icons/react'
import { useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Reveal } from '@/components/landing/kit'
import { PREPARE_TOOLS, READ_TOOLS } from '@/lib/agent/tools'

/**
 * "Run Kyte in Hermes Agent": the self-hosted, terminal-first agent from Nous Research. The section is drawn in its
 * own idiom: an ASCII field that reacts to the pointer, a block-letter banner that decodes itself, and a terminal
 * that types the install and the Autopilot cron recipe, ending with the Telegram line it produces. All three honour
 * prefers-reduced-motion by rendering their final frame.
 */

const TAP = 'hermes skills tap add usekyte-org/hermes-kyte'
const CONFIG = `# ~/.hermes/config.yaml\nmcp_servers:\n  kyte:\n    url: "https://kyte.sh/api/mcp"\n    trust: untrusted   # reads never prompt; prepare_* asks once`
const CRON = `hermes cron create "every 15m" \\\n  "Check Kyte Autopilot for wallet 0xYOUR_ADDRESS with the kyte-autopilot-watch skill. Report new triggers, otherwise reply [SILENT]." \\\n  --skill kyte-autopilot-watch --deliver telegram`

// ---------------------------------------------------------------- ASCII field (canvas)

const GLYPHS = ' ·:∙+×≡#▓'

function AsciiField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const c = ref.current
    const host = c?.parentElement
    if (!c || !host) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const CELL = 14
    let raf = 0, t = 0, w = 0, h = 0, cols = 0, rows = 0, visible = true
    const mouse = { x: -1e9, y: -1e9 }
    const resize = () => {
      const r = host.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width; h = r.height
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr)
      c.style.width = `${w}px`; c.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / CELL) + 1; rows = Math.ceil(h / CELL) + 1
      ctx.font = `${CELL - 2}px ${getComputedStyle(c).fontFamily}`
      ctx.textBaseline = 'top'
    }
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = x * CELL, py = y * CELL
          // two slow waves plus a pointer halo decide the glyph density
          const wave = 0.5 + 0.5 * Math.sin(x * 0.33 + t * 0.8) * Math.cos(y * 0.27 - t * 0.55) + 0.22 * Math.sin((x + y) * 0.14 + t * 1.2)
          const dx = px - mouse.x, dy = py - mouse.y
          const halo = Math.exp(-(dx * dx + dy * dy) / (150 * 150)) * 1.15
          const b = Math.max(0, Math.min(1, wave * 0.5 - 0.08 + halo))
          const g = GLYPHS[Math.floor(b * (GLYPHS.length - 1))]
          if (g === ' ') continue
          ctx.fillStyle = `rgba(110,255,170,${0.05 + b * 0.5})`
          ctx.fillText(g, px, py)
        }
      }
    }
    const loop = () => { t += 0.016; draw(); raf = requestAnimationFrame(loop) }
    const start = () => { if (!raf && visible && !reduce) raf = requestAnimationFrame(loop) }
    const stop = () => { cancelAnimationFrame(raf); raf = 0 }
    resize()
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw() })
    ro.observe(host)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop() }, { threshold: 0.05 })
    io.observe(host)
    const onMove = (e: PointerEvent) => { const r = host.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; if (reduce) draw() }
    const onLeave = () => { mouse.x = -1e9; mouse.y = -1e9; if (reduce) draw() }
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)
    if (reduce) draw(); else start()
    return () => { stop(); ro.disconnect(); io.disconnect(); host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave) }
  }, [reduce])
  return <canvas ref={ref} aria-hidden className={`mono ${className ?? ''}`} />
}

// ---------------------------------------------------------------- block-letter banner that decodes itself

const FONT: Record<string, string[]> = {
  H: ['█   █', '█   █', '█████', '█   █', '█   █'],
  E: ['█████', '█    ', '████ ', '█    ', '█████'],
  R: ['████ ', '█   █', '████ ', '█  █ ', '█   █'],
  M: ['█   █', '██ ██', '█ █ █', '█   █', '█   █'],
  S: [' ████', '█    ', ' ███ ', '    █', '████ '],
  K: ['█   █', '█  █ ', '███  ', '█  █ ', '█   █'],
  Y: ['█   █', ' █ █ ', '  █  ', '  █  ', '  █  '],
  T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
  '×': ['     ', ' █ █ ', '  █  ', ' █ █ ', '     '],
  ' ': ['  ', '  ', '  ', '  ', '  '],
}
const NOISE = '░▒▓█/\\|-+'
function blockLines(text: string): string[] {
  const rows = ['', '', '', '', '']
  for (const ch of text) {
    const g = FONT[ch] ?? FONT[' ']
    for (let r = 0; r < 5; r++) rows[r] += g[r] + ' '
  }
  return rows.map((r) => r.trimEnd())
}

function AsciiBanner({ text }: { text: string }) {
  const lines = useMemo(() => blockLines(text), [text])
  const width = Math.max(...lines.map((l) => l.length))
  const reduce = useReducedMotion()
  const [p, setP] = useState(reduce ? 1 : 0)
  const [tick, setTick] = useState(0)
  const runRef = useRef(0)
  const run = () => {
    if (reduce) return
    const id = ++runRef.current
    const t0 = performance.now()
    const step = (now: number) => {
      if (id !== runRef.current) return
      const q = Math.min(1, (now - t0) / 1700)
      setP(q); setTick((n) => n + 1)
      if (q < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  useEffect(() => { const t = setTimeout(run, 250); return () => clearTimeout(t) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // decode front moves left to right; the six columns ahead of it show noise where a block will land
  const front = p * (width + 6)
  const shown = lines.map((l) =>
    Array.from({ length: width }, (_, i) => {
      const ch = l[i] ?? ' '
      if (i < front - 6) return ch
      if (i < front) return ch === '█' ? NOISE[(i * 7 + tick * 3 + l.length) % NOISE.length] : ' '
      return ' '
    }).join(''),
  )
  return (
    <pre onPointerEnter={run} aria-label={text} className="hermes-banner mono select-none whitespace-pre leading-[1.05] text-accent" style={{ fontSize: 'clamp(6px, 1.45vw, 12px)' }}>
      {shown.join('\n')}
    </pre>
  )
}

// ---------------------------------------------------------------- terminal that types the recipe

type Line = { kind: 'cmd' | 'ok' | 'rule' | 'msg' | 'dim'; text: string }
const SCRIPT: Line[] = [
  { kind: 'cmd', text: TAP },
  { kind: 'ok', text: 'tap added · 2 skills · scanner: clean' },
  { kind: 'cmd', text: 'hermes skills install kyte-options kyte-autopilot-watch' },
  { kind: 'ok', text: `installed · tools mcp_kyte_* (${READ_TOOLS.length + PREPARE_TOOLS.length}) · reads never prompt` },
  { kind: 'cmd', text: 'hermes cron create "every 15m" "Check Kyte Autopilot for 0xYOUR…WALLET" --skill kyte-autopilot-watch --deliver telegram' },
  { kind: 'ok', text: 'job #7 · every 15m · next run 14:45 · deliver → telegram' },
  { kind: 'rule', text: '── telegram ─────────────────────────────' },
  { kind: 'msg', text: '▲ Kyte Autopilot · covered call · 1000 HMM · strike 20% above spot · premium 0.0001 ETH · 1d' },
  { kind: 'dim', text: '  review and sign: kyte.sh/sell?kind=call&token=HMM&… · nothing is sent until you sign' },
]

function Terminal() {
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? SCRIPT.length : 0) // lines fully shown
  const [typed, setTyped] = useState(0) // chars of the current cmd line
  useEffect(() => {
    if (reduce) return
    let t: ReturnType<typeof setTimeout>
    const cur = SCRIPT[n]
    if (!cur) { t = setTimeout(() => { setN(0); setTyped(0) }, 6500); return () => clearTimeout(t) }
    if (cur.kind === 'cmd' && typed < cur.text.length) {
      t = setTimeout(() => setTyped((c) => c + (cur.text.length > 70 ? 3 : 1)), 16)
    } else {
      t = setTimeout(() => { setN((k) => k + 1); setTyped(0) }, cur.kind === 'cmd' ? 260 : cur.kind === 'rule' ? 500 : 420)
    }
    return () => clearTimeout(t)
  }, [n, typed, reduce])
  const row = (l: Line, i: number, partial?: number) => {
    const text = partial == null ? l.text : l.text.slice(0, partial)
    const cls = l.kind === 'cmd' ? 'text-ink' : l.kind === 'ok' ? 'text-accent/90' : l.kind === 'rule' ? 'text-ink/25' : l.kind === 'msg' ? 'text-ink/90' : 'text-ink/50'
    return (
      <div key={i} className={`flex gap-2 ${cls}`}>
        {l.kind === 'cmd' && <span className="shrink-0 text-accent-2">$</span>}
        {l.kind === 'ok' && <span className="shrink-0 text-accent">✓</span>}
        <span className="min-w-0 whitespace-pre-wrap break-words">{text}{partial != null && <span className="hermes-cursor" />}</span>
      </div>
    )
  }
  const cur = SCRIPT[n]
  return (
    <div className="mono text-[12.5px] leading-[1.7] md:text-[13px]" aria-live="off">
      {SCRIPT.slice(0, n).map((l, i) => row(l, i))}
      {cur && cur.kind === 'cmd' && row(cur, n, typed)}
      {cur && cur.kind !== 'cmd' && <div className="flex gap-2 text-ink"><span className="text-accent-2">$</span><span className="hermes-cursor" /></div>}
      {!cur && <div className="flex gap-2 text-ink"><span className="text-accent-2">$</span><span className="hermes-cursor" /></div>}
    </div>
  )
}

// ---------------------------------------------------------------- the section

export function HermesSection() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text) } catch {}
    setCopied(key); setTimeout(() => setCopied(null), 1400)
  }
  return (
    <section className="mx-auto mt-24 max-w-5xl">
      <Reveal>
        <div className="eyebrow flex items-center gap-3"><span className="grad-bg h-px w-8" />Self-hosted</div>
        <h2 className="font-display mt-5 text-[32px] font-medium leading-[1.05] md:text-[44px]">Run it in Hermes Agent.</h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
          <a href="https://github.com/NousResearch/hermes-agent" target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-white/20 underline-offset-4 hover:decoration-white/60">Hermes</a> is the open-source agent from Nous Research that runs on your own machine, with your own model, and talks to you on Telegram, Discord or Slack. Point it at Kyte and it gets every tool above. Give it one cron job and Autopilot&apos;s prepared trades land in your chat as links to sign. Kyte still never sees a key.
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="hermes-shell grain hair relative mt-8 overflow-hidden rounded-3xl border bg-[#040806]">
          <AsciiField className="pointer-events-none absolute inset-0 opacity-90" />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(70% 60% at 30% 0%, rgba(4,8,6,.2), rgba(4,8,6,.92) 75%)' }} />
          <div className="relative grid gap-8 p-6 md:grid-cols-[1.15fr_1fr] md:p-9">
            <div className="min-w-0">
              <AsciiBanner text="KYTE × HERMES" />
              <div className="mt-6 rounded-2xl border border-white/[.07] bg-black/50 p-4 backdrop-blur-sm md:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="size-2 rounded-full bg-white/15" /><span className="size-2 rounded-full bg-white/15" /><span className="size-2 rounded-full bg-accent/60" />
                  <span className="eyebrow ml-2 !text-[10px]">hermes · gateway</span>
                </div>
                <Terminal />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {[
                ['Your model, your box', 'Hermes runs on a laptop or a small VPS with any model you pick. Kyte is one URL in its config; no account, no key.'],
                ['Autopilot, delivered', 'A 15-minute cron reads your waiting triggers and posts each one to Telegram as a ready-to-sign link. Nothing new, nothing sent.'],
                ['Reads flow, prepares ask', `Hermes honours the read-only annotation: ${READ_TOOLS.length} read tools run unattended, ${PREPARE_TOOLS.length} prepare tools ask you once. Nothing can sign.`],
              ].map(([t, d]) => (
                <div key={t} className="rounded-2xl border border-white/[.07] bg-black/40 p-4 backdrop-blur-sm">
                  <div className="text-[15px] font-medium text-ink">{t}</div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink/60">{d}</p>
                </div>
              ))}
              <div className="rounded-2xl border border-white/[.07] bg-black/50 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="eyebrow !text-[10px]">config.yaml</div>
                  <button type="button" onClick={() => copy(CONFIG, 'cfg')} className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink">
                    {copied === 'cfg' ? <Check size={13} className="text-accent" /> : <Copy size={13} />} {copied === 'cfg' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="mono mt-2 overflow-x-auto whitespace-pre-wrap text-[12px] leading-relaxed text-ink/80">{CONFIG}</pre>
              </div>
            </div>
          </div>
          <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-white/[.06] bg-black/40 px-6 py-4 md:px-9">
            <div className="flex flex-wrap items-center gap-2">
              <code className="mono text-[12.5px] text-ink/80">{TAP}</code>
              <button type="button" onClick={() => copy(TAP, 'tap')} className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink">
                {copied === 'tap' ? <Check size={13} className="text-accent" /> : <Copy size={13} />} {copied === 'tap' ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => copy(CRON, 'cron')} className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink">
                {copied === 'cron' ? <Check size={13} className="text-accent" /> : <Copy size={13} />} {copied === 'cron' ? 'Copied' : 'Copy the cron recipe'}
              </button>
            </div>
            <a href="https://github.com/usekyte-org/hermes-kyte" target="_blank" rel="noopener noreferrer" className="btn btn-glass btn-glass-sm">Skills on GitHub <ArrowUpRight size={14} /></a>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
