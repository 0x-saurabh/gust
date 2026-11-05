'use client'

import { Bank, Coins, Fire, Gear, LockKey, Ticket, User, Wallet, type Icon } from '@phosphor-icons/react'
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BRAND, FEES, SPLIT } from '@/lib/config'
import { isFillable, useOffers } from '@/lib/data'
import { eth, num } from '@/lib/format'
import snapshot from '@/lib/rh-mainnet-tokens.json'

/**
 * Scroll-driven story of one option's life, drawn as a node graph on a white sheet. Parties are paper nodes
 * joined by hairline connectors; every asset is a chip (with its real logo) owned by one party. When a step
 * moves an asset, the chip travels along the connector (CSS offset-path) and docks into the receiver's
 * inventory. Numbers come from a live offer.
 */

type NodeId = 'seller' | 'escrow' | 'buyer' | 'vault' | 'stakers' | 'burn' | 'ops'
type AssetId = 'tokens' | 'nft' | 'premSeller' | 'premFee' | 'strikeSeller' | 'strikeFee' | 'splitStakers' | 'splitBurn' | 'splitOps'
type Tone = 'token' | 'eth' | 'nft'
type Asset = { id: AssetId; label: string; tone: Tone }
type Ledger = Partial<Record<AssetId, NodeId | null>>
type Step = { n: string; eyebrow: string; title: string; body: string; frames: Ledger[]; badges?: Partial<Record<NodeId, string>> }
type Traveller = { key: string; asset: Asset; from: NodeId; to: NodeId }

const NODES: { id: NodeId; name: string; icon: Icon; x: number; y: number }[] = [
  { id: 'seller', name: 'Seller', icon: User, x: 14, y: 20 },
  { id: 'escrow', name: 'Kyte escrow', icon: LockKey, x: 50, y: 20 },
  { id: 'buyer', name: 'Buyer', icon: Wallet, x: 86, y: 20 },
  { id: 'vault', name: 'FeeVault', icon: Bank, x: 50, y: 54 },
  { id: 'stakers', name: `${BRAND.token} stakers`, icon: Coins, x: 16, y: 86 },
  { id: 'burn', name: 'Buy & burn', icon: Fire, x: 50, y: 86 },
  { id: 'ops', name: 'Operations', icon: Gear, x: 84, y: 86 },
]
const POS = Object.fromEntries(NODES.map((n) => [n.id, [n.x, n.y]])) as Record<NodeId, [number, number]>
const EDGES: [NodeId, NodeId][] = [
  ['seller', 'escrow'], ['escrow', 'buyer'], ['buyer', 'vault'], ['seller', 'vault'], ['escrow', 'vault'],
  ['vault', 'stakers'], ['vault', 'burn'], ['vault', 'ops'],
]
const TRAVEL_MS = 1100
const FRAME_MS = 1400
const EASE = [0.22, 1, 0.36, 1] as const

// Light palette for this section only. The rest of the page stays dark.
const C = {
  ink: '#0b0b0c',
  muted: '#6f6f73',
  faint: '#a3a3a8',
  line: '#e6e6e9',
  lineStrong: '#d4d4d9',
  green: '#00c805', // Robinhood green: dots, rails, the active path
  greenInk: '#0a7a2f', // readable green for text on white
  eth: '#627eea', // Ethereum brand blue
} as const

/** Curved connector between two nodes, in canvas pixels. Same row: an arc above. Otherwise: an S curve. */
function pathBetween(a: NodeId, b: NodeId, w: number, h: number) {
  const [ax, ay] = [(POS[a][0] / 100) * w, (POS[a][1] / 100) * h]
  const [bx, by] = [(POS[b][0] / 100) * w, (POS[b][1] / 100) * h]
  if (Math.abs(ay - by) < 4) {
    const lift = Math.min(40, Math.abs(bx - ax) * 0.18)
    return `M ${ax} ${ay} C ${ax + (bx - ax) * 0.3} ${ay - lift}, ${bx - (bx - ax) * 0.3} ${by - lift}, ${bx} ${by}`
  }
  const my = (ay + by) / 2
  return `M ${ax} ${ay} C ${ax} ${my}, ${bx} ${my}, ${bx} ${by}`
}
const edgeKey = (a: NodeId, b: NodeId) => (EDGES.some(([x, y]) => x === a && y === b) ? `${a}-${b}` : `${b}-${a}`)

// ---------------------------------------------------------------- logos

/** The Ethereum diamond, as it appears on Robinhood Chain (ETH is the gas token there). */
function EthLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <circle cx="16" cy="16" r="16" fill={C.eth} />
      <path d="M16.498 4v8.87l7.497 3.35L16.498 4z" fill="#fff" fillOpacity=".6" />
      <path d="M16.498 4 9 16.22l7.498-3.35V4z" fill="#fff" />
      <path d="M16.498 21.968v6.027L24 17.616l-7.502 4.352z" fill="#fff" fillOpacity=".6" />
      <path d="M16.498 27.995v-6.028L9 17.616l7.498 10.38z" fill="#fff" />
      <path d="m16.498 20.573 7.497-4.353-7.497-3.348v7.701z" fill="#fff" fillOpacity=".2" />
      <path d="m9 16.22 7.498 4.353v-7.701L9 16.22z" fill="#fff" fillOpacity=".6" />
    </svg>
  )
}

const ICON_BY_SYMBOL = new Map(snapshot.tokens.map((t) => [t.symbol.toUpperCase(), t.icon]))
const MONO_HUES = ['#e8f0ff', '#fff1e6', '#eafbea', '#f3e8ff', '#fff6d6']

/** Real logo for a listed mainnet token; a clean monogram coin for anything else (devnet test tokens). */
function TokenLogo({ symbol, size = 16 }: { symbol: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  const src = ICON_BY_SYMBOL.get(symbol.toUpperCase())
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full" style={{ width: size, height: size }} onError={() => setBroken(true)} />
  }
  const hue = MONO_HUES[symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % MONO_HUES.length]
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-sans font-semibold" style={{ width: size, height: size, fontSize: size * 0.5, background: hue, color: C.ink, boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.06)` }}>
      {symbol.slice(0, 1)}
    </span>
  )
}

/**
 * Artwork for the Option NFT: real NFT images from OpenSea's CDN (Pudgy Penguins, whose PENGU token trades on
 * Robinhood Chain), one picked per offer. Falls back to generative art, then to a ticket mark, if a host is down.
 */
const SEADN = 'https://i2c.seadn.io/ethereum/0xbd3531da5cf5857e7cfaa92426877b022e612cf8'
const OPENSEA_NFTS = [
  '18b83cb0c638ed9a1497f14488e848b3', 'a92de0adef86eb1da63710c8282f98ed', '7be864e7623aef497f6389666cd5c892',
  'e63badd4895ffebd9d02b1679a040744', '07bb2c625a87a839aae3d1435098d52c', '382f58322af33054cdab993172439576',
  'c60e9bc5f717fc3097ddfcfe1c5b256c', '940d0f71e41082b7f41ff3ea17ccae16',
].map((h) => `${SEADN}/${h}.png?w=120`)
const hashSeed = (seed: string) => seed.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const nftSources = (seed: string, size: number) => [
  OPENSEA_NFTS[hashSeed(seed) % OPENSEA_NFTS.length],
  `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(seed)}&size=${size * 2}&radius=0`,
]
function NftArt({ seed, size = 16 }: { seed: string; size?: number }) {
  const [attempt, setAttempt] = useState(0)
  const src = nftSources(seed, size)[attempt]
  if (!src) return <span className="flex shrink-0 items-center justify-center rounded-[5px]" style={{ width: size, height: size, background: C.ink, color: '#fff' }}><Ticket size={size * 0.62} weight="fill" /></span>
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={src} src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-[5px] object-cover" style={{ width: size, height: size, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }} onError={() => setAttempt((n) => n + 1)} />
}

function ChipIcon({ tone, symbol, seed, size = 16 }: { tone: Tone; symbol: string; seed: string; size?: number }) {
  if (tone === 'eth') return <EthLogo size={size} />
  if (tone === 'token') return <TokenLogo symbol={symbol} size={size} />
  return <NftArt seed={seed} size={size} />
}

/** One asset chip: white paper, hairline border, a soft drop shadow, logo + mono value. */
function Chip({ asset, symbol, seed, lifted = false }: { asset: Asset; symbol: string; seed: string; lifted?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white py-[3px] pl-[3px] pr-2.5 font-mono text-[11px] tabular md:text-xs"
      style={{
        color: C.ink,
        border: `1px solid ${lifted ? C.lineStrong : C.line}`,
        boxShadow: lifted ? '0 10px 28px -8px rgba(11,11,12,0.28), 0 2px 6px rgba(11,11,12,0.08)' : '0 1px 2px rgba(11,11,12,0.05)',
      }}
    >
      <ChipIcon tone={asset.tone} symbol={symbol} seed={seed} size={18} />
      {asset.label}
    </span>
  )
}

// ---------------------------------------------------------------- component

export function FlowStory() {
  const offers = useOffers()
  const live = (offers.data ?? []).filter((o) => isFillable(o) && o.kind === 'call').sort((a, b) => b.premium - a.premium)[0]
  const o = live ?? { symbol: 'ZEPH', amount: 200_000, strike: 10, premium: 0.3 }
  const nftSeed = `kyte-${o.symbol}-${live ? String(live.id) : 'example'}`

  const { assets, steps } = useMemo(() => {
    const premFee = (o.premium * FEES.premiumBps) / 10_000
    const strikeFee = (o.strike * FEES.exerciseBps) / 10_000
    const fees = premFee + strikeFee
    const f = {
      amount: `${num(o.amount, 0)} ${o.symbol}`, premium: eth(o.premium), premSeller: eth(o.premium - premFee, 4), premFee: eth(premFee, 4),
      strike: eth(o.strike), strikeSeller: eth(o.strike - strikeFee, 4), strikeFee: eth(strikeFee, 4), fees: eth(fees, 4),
      stakers: eth((fees * SPLIT.stakersBps) / 10_000, 5), burn: eth((fees * SPLIT.buybackBps) / 10_000, 5), ops: eth((fees * SPLIT.opsBps) / 10_000, 5),
    }
    const assets: Asset[] = [
      { id: 'tokens', label: f.amount, tone: 'token' }, { id: 'nft', label: 'Option NFT', tone: 'nft' },
      { id: 'premSeller', label: f.premSeller, tone: 'eth' }, { id: 'premFee', label: f.premFee, tone: 'eth' },
      { id: 'strikeSeller', label: f.strikeSeller, tone: 'eth' }, { id: 'strikeFee', label: f.strikeFee, tone: 'eth' },
      { id: 'splitStakers', label: f.stakers, tone: 'eth' }, { id: 'splitBurn', label: f.burn, tone: 'eth' }, { id: 'splitOps', label: f.ops, tone: 'eth' },
    ]
    const afterFill: Ledger = { tokens: 'escrow', premSeller: 'seller', premFee: 'vault', nft: 'buyer' }
    const afterExercise: Ledger = { tokens: 'buyer', premSeller: 'seller', premFee: 'vault', strikeSeller: 'seller', strikeFee: 'vault', nft: null }
    const steps: Step[] = [
      { n: '01', eyebrow: 'Lock', title: 'The seller locks the tokens.', body: `${f.amount} move into the Kyte escrow. The offer is live with a strike of ${f.strike} and a premium of ${f.premium}. Nothing is sold naked: the contract holds the full amount until the option settles.`, frames: [{ tokens: 'seller' }, { tokens: 'escrow' }], badges: { escrow: 'Locked' } },
      { n: '02', eyebrow: 'Fill', title: 'The buyer pays the premium.', body: `${f.premium} is paid up front: ${f.premSeller} to the seller and ${f.premFee} (${FEES.premiumBps / 100}%) to the FeeVault. The buyer receives an Option NFT, the right to buy ${f.amount} for ${f.strike} before expiry.`, frames: [{ tokens: 'escrow', premSeller: 'buyer', premFee: 'buyer' }, { tokens: 'escrow', premSeller: 'seller', premFee: 'vault' }, { tokens: 'escrow', premSeller: 'seller', premFee: 'vault', nft: 'escrow' }, afterFill], badges: { escrow: 'Locked', buyer: 'Holds the NFT' } },
      { n: '03', eyebrow: 'Settle', title: 'In the money? The holder settles.', body: `The holder pays the strike of ${f.strike}: ${f.strikeSeller} to the seller, ${f.strikeFee} (${FEES.exerciseBps / 100}%) to the FeeVault. The escrow releases ${f.amount} to the holder and the NFT is burned. No oracle, no counterparty risk.`, frames: [{ ...afterFill, strikeSeller: 'buyer', strikeFee: 'buyer' }, { ...afterFill, strikeSeller: 'seller', strikeFee: 'vault' }, afterExercise], badges: { escrow: 'Released', buyer: 'NFT burned' } },
      { n: '04', eyebrow: 'Or expiry', title: 'Out of the money? It expires.', body: `After expiry anyone can call expire. The escrow returns ${f.amount} to the seller, who keeps the ${f.premSeller} premium. The holder's NFT is burned. Either way, the seller was paid for taking the other side.`, frames: [afterFill, { ...afterFill, tokens: 'seller', nft: null }], badges: { escrow: 'Returned', seller: `Kept ${f.premSeller}` } },
      { n: '05', eyebrow: 'Split', title: 'Fees are split by code.', body: `Once per epoch, anyone can call split. The ${f.fees} collected goes ${SPLIT.stakersBps / 100}% to ${BRAND.token} stakers (${f.stakers}), ${SPLIT.buybackBps / 100}% to buy ${BRAND.token} on Uniswap v4 and burn it (${f.burn}), ${SPLIT.opsBps / 100}% to operations (${f.ops}). The events are the proof.`, frames: [afterExercise, { ...afterExercise, premFee: null, strikeFee: null, splitStakers: 'vault', splitBurn: 'vault', splitOps: 'vault' }, { ...afterExercise, premFee: null, strikeFee: null, splitStakers: 'stakers', splitBurn: 'burn', splitOps: 'ops' }, { ...afterExercise, premFee: null, strikeFee: null, splitStakers: 'stakers', splitBurn: null, splitOps: 'ops' }], badges: { burn: `${BRAND.token} burned` } },
    ]
    return { assets, steps }
  }, [o.amount, o.symbol, o.strike, o.premium])

  // ---- step (from scroll) and frame (timed within a step)
  const [step, setStep] = useState(0)
  const [frame, setFrame] = useState(0)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setStep(Number((e.target as HTMLElement).dataset.step))), { rootMargin: '-45% 0px -45% 0px' })
    stepRefs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    setFrame(0)
    const timers = steps[step].frames.slice(1).map((_, i) => setTimeout(() => setFrame(i + 1), FRAME_MS * (i + 1)))
    return () => timers.forEach(clearTimeout)
  }, [step, steps])

  // ---- ledger diffing → travellers along the connectors; chips show at the destination when they arrive
  const target = steps[step].frames[Math.min(frame, steps[step].frames.length - 1)]
  const prev = useRef<Ledger>({})
  const [travellers, setTravellers] = useState<Traveller[]>([])
  const [inTransit, setInTransit] = useState<Set<AssetId>>(new Set())
  useEffect(() => {
    const moves: Traveller[] = []
    for (const a of assets) {
      const from = prev.current[a.id] ?? null
      const to = target[a.id] ?? null
      if (from && to && from !== to) moves.push({ key: `${a.id}-${step}-${frame}`, asset: a, from, to })
    }
    prev.current = target
    if (moves.length) {
      setTravellers((t) => [...t, ...moves])
      setInTransit((s) => new Set([...s, ...moves.map((m) => m.asset.id)]))
    }
  }, [target, assets, step, frame])
  const arrive = (t: Traveller) => {
    setTravellers((list) => list.filter((x) => x.key !== t.key))
    setInTransit((s) => { const n = new Set(s); n.delete(t.asset.id); return n })
  }
  const visible: Ledger = { ...target }
  for (const id of inTransit) visible[id] = null

  // ---- geometry
  const canvas = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = canvas.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const paths = useMemo(() => Object.fromEntries(EDGES.map(([a, b]) => [`${a}-${b}`, pathBetween(a, b, size.w, size.h)])), [size])
  const activeEdges = new Set(travellers.map((t) => edgeKey(t.from, t.to)))
  const s = steps[step]
  const activeNodes = new Set<NodeId>([...travellers.flatMap((t) => [t.from, t.to]), ...(Object.keys(s.badges ?? {}) as NodeId[])])

  // ---- pin: the canvas sits at the viewport's vertical centre, exactly where the active step card is
  const pin = useRef<HTMLDivElement>(null)
  const [pinH, setPinH] = useState(0)
  useLayoutEffect(() => {
    const el = pin.current
    if (!el) return
    const ro = new ResizeObserver(() => setPinH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---- progress rail
  const sectionRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start 70%', 'end 30%'] })
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 24 })

  return (
    <div ref={sectionRef} className="rounded-[28px] bg-[#f4f4f2] p-3 md:p-5" style={{ color: C.ink, colorScheme: 'light' }}>
      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
        {/* ------------------------------------------------------------ pinned canvas */}
        <div ref={pin} className="lg:sticky lg:self-start" style={{ top: `max(88px, calc(50vh - ${pinH / 2}px))` }}>
          <div className="relative overflow-hidden rounded-[22px] bg-white" style={{ border: `1px solid ${C.line}`, boxShadow: '0 1px 2px rgba(11,11,12,0.04), 0 24px 60px -30px rgba(11,11,12,0.18)' }}>
            {/* fine engineering grid, faded at the edges */}
            <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(11,11,12,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(11,11,12,0.045)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_100%)]" />

            <div className="relative flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
              <div className="flex items-center gap-3 font-mono text-xs" style={{ color: C.muted }}>
                <span style={{ color: C.ink }}>{s.n}</span><span style={{ color: C.faint }}>/ {String(steps.length).padStart(2, '0')}</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-0.5" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
                  <motion.span className="size-1.5 rounded-full" style={{ background: C.green }} animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 2 }} />
                  {live ? 'live offer' : 'example offer'}
                  <span className="inline-flex items-center gap-1" style={{ color: C.muted }}><TokenLogo symbol={o.symbol} size={13} />{o.symbol}</span>
                </span>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: C.muted }}>{s.eyebrow}</span>
            </div>

            <div ref={canvas} className="relative aspect-[5/4] w-full md:aspect-[4/3]">
              {/* connectors */}
              <svg className="absolute inset-0 h-full w-full" width={size.w} height={size.h} viewBox={`0 0 ${size.w || 1} ${size.h || 1}`} aria-hidden>
                {EDGES.map(([a, b]) => {
                  const k = `${a}-${b}`
                  const on = activeEdges.has(k)
                  return (
                    <g key={k}>
                      <path d={paths[k]} fill="none" stroke={C.lineStrong} strokeWidth={1} />
                      <path id={`fs-${k}`} d={paths[k]} fill="none" stroke={C.ink} strokeWidth={1.25} strokeDasharray="5 7" strokeLinecap="round" className={on ? 'flow-dash' : ''} style={{ opacity: on ? 1 : 0, transition: 'opacity 400ms' }} />
                      {on && (
                        <circle r="3.5" fill={C.green} stroke="#fff" strokeWidth="1.5">
                          <animateMotion dur="1.6s" repeatCount="indefinite"><mpath href={`#fs-${k}`} /></animateMotion>
                        </circle>
                      )}
                    </g>
                  )
                })}
              </svg>

              {/* nodes */}
              {NODES.map((n) => {
                const on = activeNodes.has(n.id)
                const held = assets.filter((a) => visible[a.id] === n.id)
                const badge = s.badges?.[n.id]
                const NodeIcon = n.icon
                const burning = n.id === 'burn' && on
                return (
                  <div key={n.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
                    <div className="flex flex-col items-center">
                      <motion.div
                        animate={{ scale: on ? 1.05 : 1 }}
                        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                        className="relative flex size-14 items-center justify-center rounded-full bg-white transition-colors duration-500 md:size-16"
                        style={{
                          border: `1px solid ${on ? C.ink : C.line}`,
                          color: burning ? C.greenInk : on ? C.ink : C.muted,
                          boxShadow: on
                            ? `0 0 0 5px ${burning ? 'rgba(0,200,5,0.12)' : 'rgba(11,11,12,0.06)'}, 0 12px 28px -12px rgba(11,11,12,0.3)`
                            : '0 1px 2px rgba(11,11,12,0.05), 0 8px 20px -14px rgba(11,11,12,0.2)',
                        }}
                      >
                        <NodeIcon size={22} weight={on ? 'fill' : 'regular'} />
                        <AnimatePresence>
                          {badge && (
                            <motion.span key={badge} initial={{ opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[11px]" style={{ background: C.ink, color: '#fff', boxShadow: '0 6px 16px -6px rgba(11,11,12,0.5)' }}>
                              {badge}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.div>
                      <div className="mt-2 whitespace-nowrap text-xs font-medium transition-colors duration-500" style={{ color: on ? C.ink : C.muted }}>{n.name}</div>
                      <div className="mt-1.5 flex min-h-[26px] flex-col items-center gap-1">
                        <AnimatePresence initial={false}>
                          {held.map((a) => (
                            <motion.div key={a.id} layout initial={{ opacity: 0, scale: 0.6, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
                              <Chip asset={a} symbol={o.symbol} seed={nftSeed} />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* travellers: chips that follow the connector path */}
              {travellers.map((t) => {
                const d = paths[edgeKey(t.from, t.to)]
                const reversed = !EDGES.some(([x, y]) => x === t.from && y === t.to)
                return (
                  <motion.div
                    key={t.key}
                    className="pointer-events-none absolute left-0 top-0"
                    style={{ offsetPath: `path('${d}')`, offsetRotate: '0deg', offsetAnchor: '50% 50%' }}
                    initial={{ offsetDistance: reversed ? '100%' : '0%', opacity: 0, scale: 0.8 }}
                    animate={{ offsetDistance: reversed ? '0%' : '100%', opacity: [0, 1, 1, 0.9], scale: 1 }}
                    transition={{ duration: TRAVEL_MS / 1000, ease: EASE }}
                    onAnimationComplete={() => arrive(t)}
                  >
                    <Chip asset={t.asset} symbol={o.symbol} seed={nftSeed} lifted />
                  </motion.div>
                )
              })}
            </div>

            <div className="h-[3px] w-full" style={{ background: C.line }}><motion.div style={{ scaleX, transformOrigin: 'left', background: C.green }} className="h-full w-full" /></div>
          </div>
        </div>

        {/* ------------------------------------------------------------ scrolling steps */}
        <div className="relative">
          <div className="absolute left-[7px] top-0 hidden h-full w-px lg:block" style={{ background: C.lineStrong }} />
          {steps.map((st, i) => {
            const active = i === step
            return (
              <div key={st.n} ref={(el) => { stepRefs.current[i] = el }} data-step={i} className="relative flex min-h-[60vh] items-center pl-8 lg:min-h-screen">
                <span className="absolute left-0 top-1/2 size-[15px] -translate-y-1/2 rounded-full border-2 transition-colors duration-500" style={{ borderColor: active ? C.ink : C.lineStrong, background: active ? C.ink : '#f4f4f2' }} />
                <motion.div
                  animate={{ opacity: active ? 1 : 0.45, x: active ? 0 : -6 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="w-full rounded-2xl p-6 transition-[background-color,border-color,box-shadow] duration-500 md:p-8"
                  style={{ background: active ? '#fff' : 'transparent', border: `1px solid ${active ? C.line : 'transparent'}`, boxShadow: active ? '0 1px 2px rgba(11,11,12,0.04), 0 20px 50px -30px rgba(11,11,12,0.2)' : 'none' }}
                >
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-4xl" style={{ color: active ? C.greenInk : C.faint }}>{st.n}</span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: C.muted }}>{st.eyebrow}</span>
                  </div>
                  <h3 className="mt-4 text-2xl md:text-3xl" style={{ color: C.ink }}>{st.title}</h3>
                  <p className="mt-4 max-w-[52ch] text-base leading-relaxed" style={{ color: C.muted }}>{st.body}</p>
                </motion.div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
