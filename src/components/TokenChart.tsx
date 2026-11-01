'use client'

import { CandlestickSeries, ColorType, createChart, HistogramSeries, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type SeriesMarker, type Time, type UTCTimestamp, createSeriesMarkers } from 'lightweight-charts'
import { memo, useEffect, useRef } from 'react'
import { useCandles, useMarkers } from '@/lib/data'

export type PriceLine = { price: number; title: string; color?: string; dashed?: boolean }

/**
 * TradingView Lightweight Charts: candles + volume from Uniswap v4 swaps (via the indexer), optional price
 * lines (strikes, break even) and markers (fills, exercises). Isolated client component, no re-render churn.
 */
export const TokenChart = memo(function TokenChart({
  symbol,
  interval = 60,
  lines = [],
  height = 320,
  showMarkers = true,
  className = '',
}: {
  symbol: string
  interval?: number
  lines?: PriceLine[]
  height?: number
  showMarkers?: boolean
  className?: string
}) {
  const candles = useCandles(symbol, interval)
  const markers = useMarkers(symbol)
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null)
  const priceLines = useRef<IPriceLine[]>([])
  const fitted = useRef(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const css = getComputedStyle(document.documentElement)
    const accent = css.getPropertyValue('--color-accent').trim() || '#4dfca9'
    const c = createChart(el, {
      height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#9b9b9b', fontFamily: 'ui-monospace, monospace', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: '#1f1f1f' }, horzLines: { color: '#1f1f1f' } },
      rightPriceScale: { borderColor: '#272727', scaleMargins: { top: 0.1, bottom: 0.25 } },
      timeScale: { borderColor: '#272727', timeVisible: true, secondsVisible: interval < 60 },
      crosshair: { horzLine: { color: '#313131', labelBackgroundColor: '#272727' }, vertLine: { color: '#313131', labelBackgroundColor: '#272727' } },
      localization: { priceFormatter: (p: number) => p.toPrecision(4) },
      // Pointer over the chart: the wheel zooms (and shift/trackpad sideways pans) the chart, not the page.
      // Pointer anywhere else: the page scrolls as usual. Touch: vertical swipes still scroll the page.
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    })
    series.current = c.addSeries(CandlestickSeries, {
      upColor: accent, downColor: '#ff6b6b', borderVisible: false, wickUpColor: accent, wickDownColor: '#ff6b6b',
      priceFormat: { type: 'price', precision: 8, minMove: 1e-8 },
    })
    volume.current = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', color: '#313131', lastValueVisible: false, priceLineVisible: false })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    chart.current = c
    const ro = new ResizeObserver(() => c.applyOptions({ width: el.clientWidth }))
    ro.observe(el)
    return () => {
      ro.disconnect()
      c.remove()
      chart.current = null
      series.current = null
      volume.current = null
      fitted.current = false
    }
  }, [height, interval])

  useEffect(() => {
    const s = series.current
    const v = volume.current
    const data = candles.data ?? []
    if (!s || !v) return
    const last = data.at(-1)?.close ?? 0
    if (last > 0) {
      // 4 significant digits whatever the token's price scale (0.00004 ETH or 0.0013 ETH)
      const precision = Math.min(10, Math.max(2, Math.ceil(-Math.log10(last)) + 3))
      s.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
    }
    s.setData(data.map((d) => ({ time: d.time as UTCTimestamp, open: d.open, high: d.high, low: d.low, close: d.close })))
    v.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.volume, color: d.close >= d.open ? 'rgba(77,252,169,0.25)' : 'rgba(255,107,107,0.25)' })))
    if (!fitted.current && data.length) {
      chart.current?.timeScale().fitContent()
      fitted.current = true
    }
  }, [candles.data])

  useEffect(() => {
    const s = series.current
    if (!s) return
    priceLines.current.forEach((l) => s.removePriceLine(l))
    priceLines.current = lines.map((l) =>
      s.createPriceLine({ price: l.price, color: l.color ?? '#9b9b9b', lineWidth: 1, lineStyle: l.dashed === false ? LineStyle.Solid : LineStyle.Dashed, axisLabelVisible: true, title: l.title }),
    )
    const prices = lines.map((l) => l.price).filter((p) => p > 0)
    s.applyOptions({
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number }; margins?: { above: number; below: number } } | null) => {
        const r = original()
        if (!r || !prices.length) return r
        return { priceRange: { minValue: Math.min(r.priceRange.minValue, ...prices), maxValue: Math.max(r.priceRange.maxValue, ...prices) }, margins: r.margins }
      },
    })
  }, [lines])

  useEffect(() => {
    const s = series.current
    if (!s || !showMarkers) return
    const ms: SeriesMarker<Time>[] = (markers.data ?? []).map((m) => ({
      time: m.time as UTCTimestamp,
      position: m.name === 'Exercised' ? 'aboveBar' : 'belowBar',
      color: m.kind === 'call' ? '#4dfca9' : '#05edfa',
      shape: m.name === 'Exercised' ? 'arrowDown' : m.name === 'Expired' ? 'square' : 'circle',
      text: m.name === 'OptionBought' ? 'fill' : m.name.toLowerCase(),
    }))
    const api = createSeriesMarkers(s, ms)
    return () => api.setMarkers([])
  }, [markers.data, showMarkers])

  const empty = !candles.isLoading && (candles.data?.length ?? 0) === 0
  return (
    <div className={`relative ${className}`}>
      {/* data-lenis-prevent-wheel: the smooth scroller leaves wheel events over the chart to the chart */}
      <div
        ref={box}
        data-lenis-prevent-wheel
        className="w-full overscroll-contain"
        style={{ height }}
        onDoubleClick={() => chart.current?.timeScale().fitContent()}
        title="Scroll to zoom · drag to pan · double-click to reset"
      />
      <p className="pointer-events-none absolute left-3 top-2 hidden font-mono text-[10px] uppercase tracking-wider text-muted/70 md:block">
        scroll to zoom · drag to pan · double-click to reset
      </p>
      {candles.isLoading && <div className="shimmer absolute inset-0 rounded-lg" />}
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          No swaps for {symbol} yet. Candles appear as soon as the Uniswap v4 pool trades.
        </div>
      )}
    </div>
  )
})
