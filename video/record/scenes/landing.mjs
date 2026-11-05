// landing (8 s slot): hero push, hover `Start trading` (no click), scroll to "Real tokens. Real offers.",
// hover a few trending rows, switch the LiveFrame tab to `Open offers · live`. Logged out.
import { openScene } from '../lib.mjs'

export default async function landing() {
  const s = await openScene({ persona: 'buyer', connected: false })
  const p = s.page
  try {
    await s.goto('/', { settle: 1500 })
    s.mouse = { x: 1180, y: 860 }
    await p.mouse.move(s.mouse.x, s.mouse.y)
    const rec = await s.record('landing')
    await rec.sleep(1600) // hero breathes; compositor pushes in
    const start = p.getByRole('link', { name: 'Start trading' }).first()
    const h = await rec.hover(start, 1300, 'Start trading')
    rec.focus(h.rect, { zoom: 1.6, hold: 70, label: 'Start trading' })
    await rec.sleep(300)
    await rec.moveTo(1730, 700)
    // scroll so the "Real tokens. Real offers." heading sits near the top with the frame below it
    const target = await p.evaluate(() => { const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.includes('Real tokens')); return h.getBoundingClientRect().top + scrollY - 150 })
    await rec.scroll(target, { step: 36, interval: 20, settle: 900 })
    rec.mark('liveframe')
    await rec.sleep(500)
    const rows = p.locator('tbody tr')
    for (const sym of ['WETH', 'PONS', 'CASHCAT']) {
      const row = rows.filter({ hasText: sym }).first()
      await rec.hover(row, 650, `${sym} row`, { ax: 0.18 })
    }
    await rec.sleep(200)
    await rec.click(p.getByText(/^Open offers · /).first(), 'Open offers · live')
    await rec.sleep(1200)
    // glide across the offers so the viewer sees them
    const offerRows = p.locator('tbody tr')
    if (await offerRows.count()) await rec.hover(offerRows.nth(1), 800, 'offer row', { ax: 0.25 })
    await rec.sleep(1500)
    return await rec.stop()
  } catch (e) { await s.failShot(); throw e } finally { await s.close() }
}
