// sell (14 s slot): seller persona. /sell → Connect wallet (address appears) → Covered call → NVDA → amount 1 →
// strike ≈ spot +10% (round) → 1 week → keep the suggested premium (hover its hint) → Approve & lock 1 NVDA →
// toast Confirmed (focus zoom 2.0) → mark collateral-locked.
import { openScene, sleep, getJson, PERSONA } from '../lib.mjs'

export default async function sell() {
  const s = await openScene({ persona: 'seller', connected: false })
  const p = s.page
  try {
    await s.goto('/sell', { settle: 1500 })
    // off-camera: start on TSLA (the seller holds 20) so connecting shows no "You hold 0 …" warning for the default token
    await p.locator('button[aria-haspopup="listbox"]').first().click()
    await p.getByPlaceholder(/Search \d+ tokens/).fill('TSLA')
    await p.getByRole('option').filter({ has: p.getByText('TSLA', { exact: true }) }).first().click()
    await sleep(1200)
    s.mouse = { x: 1150, y: 300 }
    await p.mouse.move(s.mouse.x, s.mouse.y)
    const rec = await s.record('sell')
    await rec.sleep(900)
    const connectBtn = p.getByRole('button', { name: 'Connect wallet' }).first()
    await rec.click(connectBtn, 'Connect wallet')
    const addr = p.getByRole('button', { name: /0x[0-9a-f]{4}.*[0-9a-f]{4}/i }).first()
    await addr.waitFor({ timeout: 15_000 })
    const ab = await addr.boundingBox()
    rec.mark('wallet-connected', { address: PERSONA.seller, rect: { x: ab.x, y: ab.y, w: ab.width, h: ab.height } })
    rec.focus(ab, { zoom: 2.0, hold: 50, label: 'connected address' })
    await rec.sleep(1100)
    await rec.click(p.getByRole('button', { name: 'Covered call' }), 'Covered call')
    await rec.sleep(350)
    await rec.click(p.locator('button[aria-haspopup="listbox"]').first(), 'TokenPicker')
    await rec.sleep(350)
    await rec.type(p.getByPlaceholder(/Search \d+ tokens/), 'NV', { clickFirst: false, label: 'search' })
    await rec.sleep(300)
    await rec.click(p.getByRole('option', { name: /NVDA/ }).first(), 'NVDA')
    const spotEl = p.getByText(/Spot ≈/)
    await spotEl.waitFor()
    const spot = Number((await spotEl.innerText()).match(/Spot ≈ ([\d.]+)/)[1])
    // ~+5%, rounded: at +10% Black-Scholes falls under the 0.0005 ETH minimum premium and the hint turns into a warning
    const strike = (Math.round(spot * 1.05 * 1000) / 1000).toString() // e.g. 0.0824 -> 0.087
    await rec.sleep(300)
    const inputs = p.locator('input[inputmode="decimal"]')
    await rec.type(inputs.nth(0), '1', { label: 'amount', replace: true })
    await rec.sleep(250)
    await rec.type(inputs.nth(1), strike, { label: 'strike', replace: true })
    await rec.sleep(300)
    // expiry: native <select>; click it (event for the camera), then pick with the keyboard-free API
    const sel = p.locator('select').first()
    const sb = await rec.click(sel, 'Expires in')
    await sel.selectOption({ label: '1 week' })
    await rec.sleep(500)
    const hint = p.getByText(/Black-Scholes/).first()
    const hh = await rec.hover(hint, 1300, 'premium hint', { ax: 0.35 })
    rec.focus(hh.rect, { zoom: 2.0, hold: 80, label: 'Black-Scholes premium hint' })
    const submit = p.getByRole('button', { name: /Approve & lock 1 NVDA/ })
    await rec.click(submit, 'Approve & lock 1 NVDA')
    const toast = await rec.waitConfirmed(/list the call/, { label: 'Approve & lock 1 NVDA', focusZoom: 2.0 })
    // the indexer lists the offer within ~1 s
    let offer
    for (let i = 0; i < 20 && !offer; i++) { offer = (await getJson('/offers')).find((o) => o.seller.toLowerCase() === PERSONA.seller.toLowerCase() && o.symbol === 'NVDA'); if (!offer) await sleep(250) }
    rec.mark('collateral-locked', { token: 'NVDA', amount: 1, strikePerToken: Number(strike), offerId: offer?.id, toast })
    await rec.moveTo(s.mouse.x - 260, s.mouse.y - 120)
    await rec.sleep(2600)
    return await rec.stop()
  } catch (e) { await s.failShot(); throw e } finally { await s.close() }
}
