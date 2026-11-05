// stock (14 s slot, the hero moment): /market. Open the TokenPicker, hover AAPL → (list scroll) TSLA under
// ROBINHOOD STOCKS, type "NV" slowly, hover then click NVDA, chart settles, switch to 5m, hover the chart.
import { openScene, sleep, waitReady } from '../lib.mjs'

export default async function stock() {
  const s = await openScene({ persona: 'buyer', connected: false })
  const p = s.page
  try {
    await s.goto('/market', { settle: 1500 })
    const picker = p.locator('button[aria-haspopup="listbox"]').first()
    // Off-camera: warm every stock logo into the cache (they are lazy <img>s from financialmodelingprep), then
    // start from AAPL so picking NVDA visibly changes the chart.
    await picker.click(); await sleep(300)
    await p.evaluate(async () => { const lb = document.querySelector('[role=listbox]'); for (let t = 0; t < lb.scrollHeight; t += 250) { lb.scrollTop = t; await new Promise((r) => setTimeout(r, 40)) } lb.scrollTop = 0 })
    await p.waitForFunction(() => [...document.querySelectorAll('[role=listbox] img')].every((i) => i.complete), null, { timeout: 20_000 }).catch(() => console.log('[stock] some logos still loading'))
    await p.keyboard.press('Escape'); await sleep(300)
    if (await p.locator('[role=listbox]').isVisible().catch(() => false)) { await p.mouse.click(1700, 160); await sleep(300) }
    await p.getByRole('button', { name: 'AAPL', exact: true }).first().click()
    await sleep(2500)
    await waitReady(p)
    s.mouse = { x: 1000, y: 820 }
    await p.mouse.move(s.mouse.x, s.mouse.y)

    const rec = await s.record('stock')
    await rec.sleep(900)
    await rec.click(picker, 'TokenPicker')
    await rec.sleep(450)
    const lb = p.locator('[role=listbox]').first()
    const lbBox = await lb.boundingBox()
    const area = { x: lbBox.x, y: lbBox.y - 70, w: lbBox.width, h: lbBox.height + 70 } // search field + list
    rec.focus(area, { zoom: 2.5, hold: 240, label: 'ROBINHOOD STOCKS list' })
    const opt = (sym) => p.getByRole('option').filter({ has: p.getByText(sym, { exact: true }) }).first()
    await rec.hover(opt('AAPL'), 750, 'AAPL row', { ax: 0.3 })
    // glide down the alphabet to TSLA: wheel over the list
    const tslaTop = await opt('TSLA').evaluate((e) => e.offsetTop)
    const lbTop = await lb.evaluate((e) => e.scrollTop)
    const want = tslaTop - 36 * 3 - lbTop
    await rec.moveTo(s.mouse.x + 10, s.mouse.y + 40)
    await rec.scroll(want, { step: 110, interval: 16, settle: 350 })
    rec.focus(area, { zoom: 2.5, hold: 150, label: 'ROBINHOOD STOCKS list' })
    await rec.hover(opt('TSLA'), 750, 'TSLA row', { ax: 0.3 })
    // type "NV" into the (still focused) search field
    const search = p.getByPlaceholder(/Search \d+ tokens/)
    await rec.moveTo(s.mouse.x + 40, s.mouse.y - 30)
    await rec.type(search, 'NV', { clickFirst: false, label: 'search' })
    await rec.sleep(500)
    rec.focus(area, { zoom: 2.5, hold: 110, label: 'NV results' })
    const nv = opt('NVDA')
    await rec.hover(nv, 750, 'NVDA row', { ax: 0.3 })
    await rec.click(nv, 'NVDA row', { ax: 0.3 })
    rec.mark('nvda-selected')
    await rec.moveTo(1180, 760)
    await rec.sleep(2200) // chart redraws, settles
    const chartCard = p.locator('canvas').first()
    const tab5 = p.getByRole('button', { name: '5m', exact: true }).first()
    await rec.click(tab5, '5m tab')
    await rec.sleep(1600)
    // hover the chart briefly: crosshair travels along the recent candles
    const cb = await chartCard.boundingBox()
    if (cb) {
      await rec.moveTo(cb.x + cb.width * 0.55, cb.y + cb.height * 0.5)
      await rec.moveTo(cb.x + cb.width * 0.78, cb.y + cb.height * 0.45, { duration: 1.1 })
      rec.focus({ x: cb.x, y: cb.y, w: cb.width, h: cb.height }, { hold: 120, label: 'NVDA chart 5m' })
      await rec.dwell(900)
    }
    await rec.sleep(1200)
    return await rec.stop()
  } catch (e) { await s.failShot(); throw e } finally { await s.close() }
}
