// how (9 s slot): slow FlowStory scroll; each of its steps rests ~2 s so the MG callouts (Lock · Fill · Settle · Split) can sit on it.
import { openScene, sleep } from '../lib.mjs'

export default async function how() {
  const s = await openScene({ persona: 'buyer', connected: false })
  const p = s.page
  try {
    await s.goto('/', { settle: 1200 })
    // get to the section off-camera: wheel there (Lenis owns the scroll), then let it settle
    const geo = await p.evaluate(() => ({ how: document.getElementById('how').getBoundingClientRect().top + scrollY, steps: [...document.querySelectorAll('[data-step]')].map((e) => e.getBoundingClientRect().top + scrollY) }))
    const pre = geo.how + 120
    s.mouse = { x: 1770, y: 880 }
    await p.mouse.move(s.mouse.x, s.mouse.y)
    for (let y = 0; y < pre; ) { const d = Math.min(400, pre - y); await p.mouse.wheel(0, d); y += d; await sleep(30) }
    await sleep(2500)
    const rec = await s.record('how')
    await rec.sleep(1200)
    let cur = await p.evaluate(() => scrollY)
    for (let i = 0; i < geo.steps.length; i++) {
      const want = geo.steps[i] // a step section is one viewport tall; its content is centred
      const y = await rec.scroll(want - cur, { step: 45, interval: 16, settle: 300 })
      cur = y
      rec.mark('flow-step', { step: i })
      await rec.sleep(i === geo.steps.length - 1 ? 2000 : 1700)
    }
    return await rec.stop()
  } catch (e) { await s.failShot(); throw e } finally { await s.close() }
}
