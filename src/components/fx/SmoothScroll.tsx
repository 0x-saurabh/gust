'use client'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

gsap.registerPlugin(ScrollTrigger)

/** Lenis smooth scrolling driven by GSAP's ticker, kept in sync with ScrollTrigger and reset on every route change. */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenis = useRef<Lenis | null>(null)
  const path = usePathname()

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const l = new Lenis({ lerp: 0.11, smoothWheel: true, wheelMultiplier: 0.95, autoRaf: false })
    l.on('scroll', ScrollTrigger.update)
    const tick = (t: number) => l.raf(t * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    lenis.current = l
    return () => {
      gsap.ticker.remove(tick)
      l.destroy()
      lenis.current = null
    }
  }, [])

  // A new page starts at the top: Next resets the window, Lenis must forget the previous page's target too.
  useEffect(() => {
    if (window.location.hash) return
    lenis.current?.scrollTo(0, { immediate: true, force: true })
    window.scrollTo(0, 0)
    ScrollTrigger.refresh()
  }, [path])

  return <>{children}</>
}
