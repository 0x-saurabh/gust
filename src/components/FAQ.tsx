'use client'

import { CaretDown } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'

const EASE = [0.22, 1, 0.36, 1] as const

export type QA = { q: string; a: string }

/** Accordion FAQ. Also rendered as plain question and answer markup, so it reads for search and AEO. */
export function FAQ({ items }: { items: QA[] }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((it, i) => {
        const on = open === i
        return (
          <div key={it.q}>
            <button
              type="button"
              aria-expanded={on}
              onClick={() => setOpen(on ? null : i)}
              className="flex w-full items-center justify-between gap-6 py-5 text-left text-lg text-ink transition-colors duration-300 hover:text-accent"
            >
              <span>{it.q}</span>
              <motion.span animate={{ rotate: on ? 180 : 0 }} transition={{ duration: 0.5, ease: EASE }} className="shrink-0 text-muted">
                <CaretDown size={18} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {on && (
                <motion.div
                  key="a"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="overflow-hidden"
                >
                  <p className="max-w-[680px] pb-6 text-base leading-relaxed text-muted">{it.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
