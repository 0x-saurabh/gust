# Kyte demo film: shared spec

This is the contract between the workstreams. Change it only through the lead.

## Output
- 1920x1080, 60 fps, H.264 yuv420p.
- About 90 s (85–95 s accepted).
- Audio: synthesized SFX only (no music), -14 LUFS integrated, -2 dBTP.
- Final file: `video/out/kyte-demo-90s.mp4`.

## Layout
```
video/
  SPEC.md                    this file
  env/                       Env agent: up.sh, down.sh, fund.mjs, seed.mjs, README.md
  record/                    Recording agent
    wallet-shim.js           EIP-1193 + EIP-6963 "Demo Wallet" (Env agent writes it)
    lib.mjs                  shared helpers: eased mouse, event logger, screencast capture
    scenes/<scene>.mjs       one Playwright script per scene
  recordings/<scene>/        gitignored. frames/000000.jpg… (60 fps, 2880x1620) + events.json + meta.json
  remotion/                  Remotion project (own package.json)
    src/Root.tsx             compositions: Film (full), plus one per scene for stills
    src/Film.tsx             timeline (Camera/compositor agent)
    src/camera/              Camera.tsx, Cursor.tsx, zoom math (Camera/compositor agent)
    src/mg/                  Welcome.tsx, Outro.tsx, Callout.tsx, KineticTitle.tsx, NftCard.tsx, transitions/ (Motion-graphics agent)
    src/theme.ts             tokens below
    public/sfx/*.wav         Sound agent
    public/recordings -> ../../recordings   symlink
  out/                       gitignored renders, stills, contact sheet
```

## Theme (from the site's globals.css)
- Background #000. Card #181818, border #272727, radius 16. Text #fff, muted #9b9b9b.
- Mint #4dfca9 (calls / positive). Cyan #05edfa (puts). Warn #ffd166. Danger #ff6b6b.
- Gradients: hero #7cff8e → #5cffc4 → #4af0ff; text and buttons #6eff85 → #4affec.
- Fonts: Inter Tight 300 (hero), Space Grotesk (display), Geist Sans (body), Geist Mono (numbers and labels; uppercase, 0.08em tracking).
- Ease: cubic-bezier(0.16,1,0.3,1). Springs are critically damped: `1-(1+wt)e^(-wt)`, w 12–40.
- No crossfades, blur-ins, glitch, spin or particles. Transitions are match cuts, color floods (0.3 s, overscaled) and iris/mask reveals.
- Brand assets: `public/brand/kyte-mark.png`, `kyte-wordmark.png`, `aura-smooth.jpg`.

## Scenes (ids, target length in the film, source)
| id | len | source | content |
|---|---|---|---|
| welcome | 7.0s | MG | aurora bloom, mark draws on, "Options," / "on Your terms." word rise, mint line sweeps and match-cuts into the landing |
| landing | 8.0s | REC `/` | hero push, hover `Start trading`, scroll to "Real tokens. Real offers.", hover trending rows, tab `Open offers · live` |
| how | 9.0s | REC `/#how` | slow FlowStory scroll; MG callouts Lock · Fill · Settle · Split |
| stock | 14.0s | REC `/market` | open TokenPicker, type "NV", hover AAPL→TSLA→NVDA in ROBINHOOD STOCKS (zoom ~2.5x), click NVDA, zoom out to chart, tab 5m |
| sell | 14.0s | REC `/sell` | Connect wallet → Demo Wallet; covered call NVDA, amount 1, strike, 1 week; premium hint; `Approve & lock 1 NVDA`; toast Confirmed; MG "Collateral locked on-chain" |
| buy | 12.0s | REC `/market` (buyer persona) | `Buy` on an offer, BuyDialog rows, `Buy for X ETH`, Confirmed, then MG NftCard (real tokenURI SVG) flies toward Positions |
| settle | 10.0s | REC `/positions` | Holding tab, `Exercise`, payout toast, `Unwrap WETH → ETH`; MG token-flow callout |
| stake | 9.0s | REC `/stake` then `/proof` | stake KYTE, `Claim WETH`; cut to /proof headline + burn chart |
| outro | 7.0s | MG | iris closes into the mark; "kyte.sh · Live on Robinhood Chain"; hold 2 s |

Total: 90 s. Recordings run longer than their slot; the compositor trims and retimes holds, and never retimes actions.

## Recording capture
- Viewport 1920x1080 CSS px at deviceScaleFactor 1.5, so frames are 2880x1620. Measured: CDP screencast headless at DPR 1.5 = 58.6 fps; DPR 2 = 44 fps (too slow). Zoom is capped at 2.2x (2.5x only for the stock-picker hero moment, accepting a little softness).
- Chromium: Playwright 1.55 launched with `executablePath` = `~/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` (its own revision 1187 isn't cached), plus `--force-device-scale-factor=1.5`. A working capture test is at `$CLAUDE_JOB_DIR/tmp/captest/cap-15.mjs`.
- The screencast is variable-rate, delivering frames only when something changes. Keep each frame's `metadata.timestamp`, then resample to a constant 60 fps by duplicating the nearest-earlier frame for each 1/60 s slot. Write `meta.json` with the source fps stats. Frames are JPEG q90. Events use the same clock, so convert event times to the resampled frame index.
- The native cursor is hidden (CSS `* { cursor: none !important }`). The compositor draws the cursor from events.

## events.json (one per scene; all coordinates in CSS px of the 1920x1080 viewport)
```json
{
  "scene": "stock",
  "fps": 60,
  "frames": 1234,
  "viewport": { "w": 1920, "h": 1080, "dpr": 1.5 },
  "events": [
    { "f": 0,   "type": "cursor", "x": 960, "y": 540 },
    { "f": 12,  "type": "cursor", "x": 970, "y": 548 },
    { "f": 90,  "type": "hover",  "x": 812, "y": 401, "rect": { "x": 700, "y": 380, "w": 260, "h": 44 }, "label": "AAPL row", "dwell": 40 },
    { "f": 130, "type": "click",  "x": 812, "y": 401, "rect": { "x": 700, "y": 380, "w": 260, "h": 44 }, "label": "NVDA row" },
    { "f": 140, "type": "type",   "text": "NV", "rect": { "x": 600, "y": 300, "w": 500, "h": 48 } },
    { "f": 200, "type": "scroll", "dy": 600 },
    { "f": 260, "type": "focus",  "rect": { "x": 1500, "y": 900, "w": 380, "h": 120 }, "label": "TxStatus toast", "zoom": 2.0, "hold": 90 },
    { "f": 300, "type": "tx",     "state": "confirmed", "label": "Approve & lock 1 NVDA" },
    { "f": 320, "type": "mark",   "name": "nft-minted", "data": { "tokenId": "…", "svg": "nft.svg" } }
  ]
}
```
- `cursor` events are sampled every frame while the mouse moves.
- `focus` is an explicit camera hint from the recording script. `zoom` is optional; without it the compositor fits the rect to about 45% of the frame width.
- The compositor auto-zooms (max 2.2x) on `click`, on `hover` events with dwell ≥ 30 frames, and on `focus`. Zoom is log-space and springs at w≈14. It stays on one target until the next target or 2 s of idle, then returns to 1.0x. It never goes in and back out within 0.5 s.
- Sound cues come from: click → `click.wav`, type → `key.wav` per char, tx confirmed → `confirm.wav`, mark nft-minted → `shimmer.wav`, scene transitions → `whoosh.wav`, welcome → `swell.wav`.

## Demo chain (Env agent)
- anvil fork of Robinhood Chain mainnet at http://127.0.0.1:8549 (chain 4663; fork-proxy on 8548 retries pruned-state reads, `--block-time 1`).
- Local indexer at http://127.0.0.1:4299. Site clone on http://localhost:3011 with Privy off.
- Personas: seller = anvil #0 `0xf39F…2266`, buyer = anvil #1 `0x7099…79C8`, seeders = anvil #2–#4.
- The user's dev server on :3010 must never be stopped or touched.
