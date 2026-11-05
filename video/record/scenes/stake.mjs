// stake (9 s slot): buyer persona (pre-staked + an epoch split already landed, see prep.mjs stake).
// /stake → amount 1000 → Stake 1,000 → Confirmed → Claim WETH → Confirmed → nav Proof → headline → slow scroll to the
// fee split cards ("The rule, and what actually happened"). The on-chain KYTE token is named "TI / Test": no focus zooms on token names.
import { openScene, sleep, waitReady } from '../lib.mjs'

export default async function stake() {
  const s = await openScene({ persona: 'buyer', connected: true })
  const p = s.page
  try {
    await s.goto('/stake', { settle: 1500 })
    const claimBtn = p.getByRole('button', { name: 'Claim WETH' })
    await claimBtn.waitFor()
    await p.waitForFunction(() => /Claimable\s*\n?\s*(?!0 ETH)[<\d.]+\s*ETH/.test(document.body.innerText), null, { timeout: 15_000 }).catch(() => console.log('[stake] claimable still reads 0?'))
    s.mouse = { x: 1000, y: 880 }
    await p.mouse.move(s.mouse.x, s.mouse.y)
    const rec = await s.record('stake')
    await rec.sleep(900)
    const amount = p.getByPlaceholder('0').first()
    await rec.type(amount, '1000', { label: 'amount', replace: true })
    await rec.sleep(400)
    const stakeBtn = p.getByRole('button', { name: /^Stake [\d,]+$/ })
    await rec.click(stakeBtn, 'Stake 1,000')
    await rec.waitConfirmed(/^Stake /, { label: 'Stake 1,000', focusZoom: 2.0 })
    await rec.sleep(1200)
    const claimRow = p.getByText('Claimable', { exact: true }).first()
    const pos = p.locator('div').filter({ has: claimRow }).filter({ has: claimBtn }).last()
    const pb = await pos.boundingBox()
    rec.focus(pb, { zoom: 1.8, hold: 120, label: 'Your position · Claimable' })
    await rec.hover(claimRow, 800, 'Claimable', { ax: 0.5 })
    const claimTxt = await p.locator('div').filter({ has: claimRow }).last().innerText().catch(() => '')
    await rec.click(claimBtn, 'Claim WETH')
    const t = await rec.waitConfirmed(/^Claim /, { label: 'Claim WETH', focusZoom: 2.0 })
    rec.mark('claimed', { claimable: claimTxt.replace(/\s+/g, ' ').trim(), toast: t })
    await rec.sleep(1500)
    // to /proof through the nav (client-side navigation: the screencast keeps running)
    await rec.click(p.getByRole('link', { name: 'Proof', exact: true }).first(), 'Proof')
    await p.waitForURL(/\/proof/)
    await p.getByText(/Every fee\. Every/).first().waitFor()
    rec.mark('cut-to-proof')
    await waitReady(p, 4000)
    const h1 = p.locator('h1').first()
    const hb = await h1.boundingBox()
    rec.focus(hb, { zoom: 1.4, hold: 100, label: 'Every fee. Every burn. On the record.' })
    await rec.moveTo(1500, 620)
    await rec.sleep(1600)
    // Down to the fee split cards (real numbers). The burn chart below stays empty on the fork: the KYTE pool has no
    // liquidity there, so no buyback can execute (see prep.mjs).
    const rule = p.getByRole('heading', { name: /The rule, and what actually happened/ }).first()
    const rt = await rule.evaluate((e) => e.getBoundingClientRect().top + scrollY)
    const cur = await p.evaluate(() => scrollY)
    await rec.scroll(rt - 330 - cur, { step: 16, interval: 20, settle: 900 })
    const cards = p.locator('div').filter({ has: rule }).last()
    const rb = await rule.boundingBox()
    rec.mark('fee-split', { headingRect: { x: rb.x, y: rb.y, w: rb.width, h: rb.height } })
    rec.focus({ x: rb.x, y: rb.y - 30, w: 1176, h: 360 }, { zoom: 1.5, hold: 150, label: 'Where fees go: stakers 30% · buy & burn 20% · ops 50%' })
    await rec.sleep(3000)
    return await rec.stop()
  } catch (e) { await s.failShot(); throw e } finally { await s.close() }
}
