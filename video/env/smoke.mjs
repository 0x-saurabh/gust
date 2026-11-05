// End-to-end smoke test of the local demo stack, headless, with the Demo Wallet shim.
//
//   node video/env/smoke.mjs
//
// 1. seller: /sell -> Connect wallet -> covered call on NVDA (amount 1, strike ~+5%, 1 week) -> Confirmed (x2: approve, lock)
// 2. buyer:  /market -> Buy on the seeded buy-scene offer -> Buy for X ETH -> Confirmed
// 3. indexer lists the new offer and the filled one; nft.mjs renders the bought option's SVG
// Screenshots: $DEMO_DIR/smoke/*.png. Timings: $DEMO_DIR/smoke/timings.json.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const JOB = process.env.CLAUDE_JOB_DIR || '/Users/apple/.claude/jobs/9eeca95c'
const DEMO_DIR = process.env.DEMO_DIR || path.join(JOB, 'tmp/demo')
const OUT = path.join(DEMO_DIR, 'smoke')
const SITE = process.env.SITE_URL || 'http://localhost:3011'
const RPC = process.env.RPC_URL || 'http://127.0.0.1:8549'
const INDEXER = process.env.INDEXER_URL || 'http://127.0.0.1:4299'
const PW_DIR = process.env.PLAYWRIGHT_DIR || path.join(JOB, 'tmp/captest/node_modules/playwright')
const CHROME = process.env.CHROME_PATH || '/Users/apple/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const { chromium } = createRequire(import.meta.url)(PW_DIR)
fs.mkdirSync(OUT, { recursive: true })

const seeded = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'seeded.json'), 'utf8'))
// Buys a still-open seeded NVDA call other than the buy-scene offer, so the film's offer stays open.
const openIds = new Set((await (await fetch(`${INDEXER}/offers`)).json()).map((o) => o.id))
const buyOffer = seeded.offers.find((o) => o.symbol === 'NVDA' && o.kind === 'call' && o.id !== seeded.buyScene && openIds.has(o.id))
if (!buyOffer) throw new Error('no open seeded NVDA call left to test with (besides the buy-scene one): FRESH=1 up.sh, or seed more')
const timings = {}
const t0 = Date.now()
const mark = (k) => { timings[k] = (Date.now() - t0) / 1000; console.log(`[smoke] ${timings[k].toFixed(1)}s ${k}`) }
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
async function newPage(persona) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5 })
  await ctx.addInitScript(`window.__DEMO_WALLET_CONFIG = { rpc: ${JSON.stringify(RPC)}, persona: ${JSON.stringify(persona)} }`)
  await ctx.addInitScript({ path: path.join(ROOT, 'video/record/wallet-shim.js') })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[page error]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)) })
  return page
}
async function connect(page) {
  await page.getByRole('button', { name: 'Connect wallet' }).first().click()
  // Injected connector: no picker. If a picker ever shows (Privy), choose Demo Wallet.
  const picker = page.getByText('Demo Wallet').first()
  if (await picker.isVisible({ timeout: 1500 }).catch(() => false)) await picker.click()
  await page.getByRole('button', { name: /0x[0-9a-f]{4}.*[0-9a-f]{4}/i }).first().waitFor({ timeout: 15_000 })
}
async function waitConfirmed(page, label, timeout = 60_000) {
  const card = page.locator('div.card.fixed').filter({ hasText: label })
  await card.getByText('Confirmed').waitFor({ timeout })
}

try {
  // ---------------------------------------------------------------- seller: covered call on NVDA
  const sell = await newPage('seller')
  await sell.goto(`${SITE}/sell`, { waitUntil: 'networkidle' })
  mark('sell loaded')
  await shot(sell, '01-sell-disconnected')
  await connect(sell)
  mark('seller connected')
  await sell.getByRole('button', { name: 'Covered call' }).click()
  await sell.locator('button[aria-haspopup="listbox"]').first().click()
  await sell.getByPlaceholder(/Search \d+ tokens/).fill('NV')
  await sell.waitForTimeout(400)
  await shot(sell, '02-sell-picker')
  await sell.getByRole('option', { name: /NVDA/ }).first().click()
  await sell.getByText(/Spot ≈/).waitFor()
  const spot = Number((await sell.getByText(/Spot ≈/).innerText()).match(/Spot ≈ ([\d.]+)/)[1])
  const strike = (spot * 1.05).toPrecision(3)
  const strikeInput = sell.locator('input[inputmode="decimal"]').nth(1)
  await strikeInput.fill(strike)
  await sell.locator('select').first().selectOption({ label: '1 week' })
  const submit = sell.getByRole('button', { name: /Approve & lock 1 NVDA/ })
  await submit.waitFor()
  await sell.waitForTimeout(600)
  await shot(sell, '03-sell-filled')
  mark('sell form filled')
  await submit.click()
  // The approve step's "Confirmed" lasts only until the lock step starts (often <1 s): catch it if we can.
  // (In practice the approve step goes straight from "Waiting for confirmation…" to the lock step's "Checking…".)
  waitConfirmed(sell, 'Approve NVDA', 10_000).then(() => mark('approve confirmed'), () => {})
  await waitConfirmed(sell, 'list the call')
  mark('lock confirmed')
  fs.writeFileSync(path.join(OUT, 'wallet-log-sell.json'), JSON.stringify(await sell.evaluate(() => window.__demoWallet.log), null, 1))
  await shot(sell, '05-sell-confirmed')

  // ---------------------------------------------------------------- buyer: buy the seeded NVDA call
  const buy = await newPage('buyer')
  await buy.goto(`${SITE}/market`, { waitUntil: 'networkidle' })
  mark('market loaded')
  await connect(buy)
  mark('buyer connected')
  await buy.waitForTimeout(1500)
  await shot(buy, '06-market')
  // The buy-scene offer: NVDA call, its amount and strike/token are in seeded.json.
  const row = buy.locator('tbody tr').filter({ hasText: `${buyOffer.strikePerToken.toPrecision(3)} ETH` }).filter({ hasText: 'NVDA' }).first()
  await row.getByRole('button', { name: 'Buy' }).click()
  const buyBtn = buy.getByRole('button', { name: /^Buy for / })
  await buyBtn.waitFor()
  await buy.waitForTimeout(1200)
  await shot(buy, '07-buy-dialog')
  mark('buy dialog open')
  await buyBtn.click()
  await waitConfirmed(buy, 'Buy call for')
  mark('buy confirmed')
  await shot(buy, '08-buy-confirmed')

  // ---------------------------------------------------------------- indexer + positions
  fs.writeFileSync(path.join(OUT, 'wallet-log-buy.json'), JSON.stringify(await buy.evaluate(() => window.__demoWallet.log), null, 1))
  const until = Date.now() + 30_000
  let mine, filled
  while (Date.now() < until) {
    const open = await (await fetch(`${INDEXER}/offers`)).json()
    const all = await (await fetch(`${INDEXER}/offers?status=all`)).json()
    mine = open.find((o) => o.seller.toLowerCase() === '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' && o.symbol === 'NVDA')
    filled = all.find((o) => o.id === buyOffer.id && o.status === 'filled')
    if (mine && filled) break
    await new Promise((r) => setTimeout(r, 500))
  }
  mark(`indexer: seller offer ${mine ? 'listed' : 'MISSING'}, buy-scene offer ${filled ? 'filled' : 'NOT filled'}`)
  await buy.goto(`${SITE}/positions`, { waitUntil: 'networkidle' })
  await buy.waitForTimeout(2500)
  await shot(buy, '09-positions-buyer')
  for (const [name, url] of [['10-landing', '/'], ['11-stake', '/stake'], ['12-proof', '/proof']]) {
    await buy.goto(`${SITE}${url}`, { waitUntil: 'networkidle' })
    await buy.waitForTimeout(2500)
    await shot(buy, name)
  }
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ timings, sellerOffer: mine?.id, filledOffer: filled?.id, holder: filled?.holder }, null, 2) + '\n')
  if (filled) console.log(execFileSync('node', [path.join(HERE, 'nft.mjs'), filled.id, path.join(OUT, 'nft.svg')], { encoding: 'utf8' }).trim())
  if (!mine || !filled) process.exitCode = 1
} catch (e) {
  console.error('[smoke] FAILED:', e.message)
  for (const p of browser.contexts().flatMap((c) => c.pages())) await p.screenshot({ path: path.join(OUT, `fail-${Date.now()}.png`) }).catch(() => {})
  process.exitCode = 1
} finally {
  fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(timings, null, 2) + '\n')
  await browser.close()
}
