// buy (12 s slot): buyer persona, connected. /market → NVDA → hover the buy-scene offer row → Buy → BuyDialog rows
// (You pay now, Break-even, Expires) → Buy for … → Confirmed → render the minted Option NFT's on-chain SVG and
// mark nft-minted (with the nav Positions rect the NftCard flies to).
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { openScene, sleep, getJson, seeded, ROOT, PERSONA } from '../lib.mjs'

export default async function buy() {
  const offer = seeded().offers.find((o) => o.label === 'buy-scene')
  const open = await getJson('/offers')
  if (!open.some((o) => o.id === offer.id)) throw new Error('buy-scene offer is not open: run node video/env/reset.mjs')
  const s = await openScene({ persona: 'buyer', connected: true })
  const p = s.page
  try {
    await s.goto('/market', { settle: 1200 })
    await p.getByRole('button', { name: /0x7099/i }).first().waitFor({ timeout: 15_000 })
    await p.getByRole('button', { name: 'AAPL', exact: true }).first().click() // off-camera: start elsewhere
    await sleep(2000)
    s.mouse = { x: 1300, y: 200 }
    await p.mouse.move(s.mouse.x, s.mouse.y)
    const rec = await s.record('buy')
    await rec.sleep(700)
    await rec.click(p.getByRole('button', { name: 'NVDA', exact: true }).first(), 'NVDA')
    await rec.sleep(1500)
    const strikeTxt = `${offer.strikePerToken.toPrecision(3)} ETH`
    const row = p.locator('tbody tr').filter({ hasText: strikeTxt }).filter({ hasText: 'NVDA' }).first()
    await row.waitFor()
    // bring the offer table into view gently if it is below the fold
    const rb = await row.boundingBox()
    if (rb.y + rb.height > 1000) await rec.scroll(rb.y + rb.height - 860, { step: 30, settle: 500 })
    const h = await rec.hover(row, 900, 'buy-scene offer row', { ax: 0.42 })
    rec.focus(h.rect, { hold: 60, label: 'NVDA call · 2 · strike ' + strikeTxt })
    await rec.click(row.getByRole('button', { name: 'Buy' }), 'Buy')
    const dlg = p.getByRole('dialog')
    await dlg.waitFor()
    await rec.sleep(700)
    const dRow = (k) => dlg.locator('div.flex.justify-between').filter({ has: p.locator('dt', { hasText: k }) }).first()
    const db = await dlg.boundingBox()
    rec.focus(db, { hold: 220, label: 'BuyDialog' })
    for (const [k, ms] of [['You pay now', 900], ['Break-even', 800], ['Expires', 800]]) await rec.hover(dRow(k), ms, k, { ax: 0.5 })
    const btn = p.getByRole('button', { name: /^Buy for / })
    const btnLabel = (await btn.innerText()).trim()
    await rec.click(btn, btnLabel)
    const toast = await rec.waitConfirmed(/^Buy call for/, { label: btnLabel, focusZoom: 2.0 })
    // tokenId: the option NFT id is the offer id; confirm the fill via the indexer (holder = buyer)
    let filled
    for (let i = 0; i < 40 && !filled; i++) { filled = (await getJson('/offers?status=all')).find((o) => o.id === offer.id && o.status === 'filled'); if (!filled) await sleep(250) }
    if (!filled || filled.holder?.toLowerCase() !== PERSONA.buyer.toLowerCase()) console.log('[buy] warning: indexer fill not seen yet', filled)
    const svgOut = path.join(ROOT, 'video/remotion/public/nft/option.svg')
    fs.mkdirSync(path.dirname(svgOut), { recursive: true })
    execFileSync('node', [path.join(ROOT, 'video/env/nft.mjs'), offer.id, svgOut], { stdio: 'inherit' })
    const pos = await p.getByRole('link', { name: 'Positions', exact: true }).first().boundingBox()
    rec.mark('nft-minted', { tokenId: offer.id, svg: 'nft/option.svg', positionsRect: { x: pos.x, y: pos.y, w: pos.width, h: pos.height }, toast })
    await rec.moveTo(s.mouse.x - 300, s.mouse.y - 200)
    await rec.sleep(2800)
    return await rec.stop()
  } catch (e) { await s.failShot(); throw e } finally { await s.close() }
}
