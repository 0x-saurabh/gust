// settle (10 s slot): buyer persona. /positions → Holding → hover the NVDA call bought in `buy` → Exercise →
// Confirmed (pays the strike in ETH, receives the NVDA) → Unwrap WETH → ETH (a real put payout, see prep.mjs settle)
// → Confirmed. mark 'settled' with what moved, for the TokenFlow callout.
import { openScene, sleep, getJson, seeded, PERSONA } from '../lib.mjs'

export default async function settle() {
  const id = seeded().buyScene
  const o = (await getJson('/offers?status=all')).find((x) => x.id === id)
  if (!o || o.status !== 'filled' || o.holder?.toLowerCase() !== PERSONA.buyer.toLowerCase()) throw new Error('buyer does not hold the buy-scene option: record buy first')
  const s = await openScene({ persona: 'buyer', connected: true })
  const p = s.page
  try {
    await s.goto('/positions', { settle: 1500 })
    await p.getByRole('button', { name: /^Exercise$/ }).first().waitFor({ timeout: 15_000 })
    await sleep(800)
    s.mouse = { x: 1100, y: 760 }
    await p.mouse.move(s.mouse.x, s.mouse.y)
    const rec = await s.record('settle')
    await rec.sleep(900)
    const tab = p.getByRole('button', { name: /^Holding \(\d+\)$/ }).first()
    await rec.hover(tab, 600, 'Holding tab')
    const row = p.locator('div').filter({ has: p.getByRole('button', { name: /^Exercise$/ }) }).filter({ hasText: `${o.amount} NVDA` }).last()
    const h = await rec.hover(row, 1100, `${o.amount} NVDA call row`, { ax: 0.3 })
    rec.focus(h.rect, { hold: 90, label: 'NVDA call held' })
    const label = `Exercise: pay`
    await rec.click(row.getByRole('button', { name: /^Exercise$/ }), 'Exercise')
    const t1 = await rec.waitConfirmed(/^Exercise: pay/, { label: 'Exercise', focusZoom: 2.0 })
    rec.mark('settled', { tokenId: id, moved: [{ asset: 'NVDA', amount: o.amount, from: 'escrow', to: 'buyer' }, { asset: 'ETH', amount: o.strike, from: 'buyer', to: 'seller', note: 'strike, 0.1% exercise fee to the FeeVault' }], toast: t1 })
    await rec.sleep(1600)
    const unwrap = p.getByRole('button', { name: /Unwrap WETH/ })
    await unwrap.waitFor()
    if (await unwrap.isEnabled()) {
      const wethCard = p.locator('div').filter({ has: unwrap }).filter({ hasText: 'WETH (payouts)' }).last()
      const wb = await wethCard.boundingBox()
      rec.focus(wb, { hold: 80, label: 'ETH / WETH balances' })
      await rec.hover(p.getByText('WETH (payouts)').first(), 700, 'WETH (payouts)')
      await rec.click(unwrap, 'Unwrap WETH → ETH')
      const t2 = await rec.waitConfirmed(/^Unwrap/, { label: 'Unwrap WETH → ETH', focusZoom: 2.0 })
      rec.mark('unwrapped', { toast: t2 })
    } else console.log('[settle] no WETH to unwrap')
    await rec.moveTo(s.mouse.x - 250, s.mouse.y + 180)
    await rec.sleep(2400)
    return await rec.stop()
  } catch (e) { await s.failShot(); throw e } finally { await s.close() }
}
