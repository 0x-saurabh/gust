# Security self-assessment on kyte.sh: `/audit` page (plan)

Source folder: `/Volumes/my_files/Airdrop/kyte-audit/report/` (9 Nov 2026, report v1.1).
Status: plan only, nothing implemented yet. Written 9 Nov 2026.

## 1. What the folder contains

| File | Size | SHA-256 | Role on the site |
|---|---|---|---|
| `kyte-security-self-assessment.html` | 49 KB | `978a2824…df22e` | The full report, one self-contained file (inline CSS, one inline SVG, no scripts, only external links are Blockscout addresses) |
| `kyte-security-self-assessment.pdf` | 587 KB | `5ada21ef…a9969a` | Download link |
| `kyte-security-self-assessment-raw.zip` | 500 KB | `69cc67a0…99499f` | Raw Slither JSON/text + Aderyn Markdown per contract, `scope.json`, `onchain-state.json` |

Note: the brief mentions a `README.txt` with upload steps. It is **not** in the folder. The steps below replace it.
`report/raw/` is the unzipped copy of the zip; `scripts/`, `sources/`, `results/`, `.tools/` are the build pipeline and do not go on the site.

## 2. What the report says (so the page copy is accurate)

- **It is a self-assessment, not a third-party audit.** The report says this in its first paragraph and in its footer. The Kyte team ran Slither 0.11.4 and Aderyn 0.6.8 on the Sourcify-verified source of 12 deployed contracts, reviewed results by hand, and read live config at block 109,974,684 on Robinhood Chain (4663).
- **Results:** 0 critical, 0 high, 0 medium, **5 low, 5 informational**, all "Acknowledged".
- **Low:** KYT-01/02 on-chain buyback route (unfunded pool, price floor follows last fill; route not in use, buybacks are manual), KYT-03 Router can be griefed with 1 wei WETH (direct WETH market access still works), KYT-04 timelock delay is 10 minutes on chain while `Governed.sol` NatSpec says 48 h, KYT-05 physical settlement depends on underlying token transferability.
- **Info:** KYT-06 guardian Safe is 1-of-3, KYT-07 `StakingPool.notifyReward` has no event, KYT-08 KyteHaltGate reverts on a future oracle timestamp, KYT-09 rebasing tokens would break accounting, KYT-10 live contracts built from different commits.
- **Checks that passed (11):** no admin path to escrowed collateral, exits never paused, reentrancy guarded, fees capped (3% / 0.1%, caps 10% / 1%), fee-on-transfer rejected, NFT minting locked to markets, fee split bounded, no JIT staking rewards, Router holds nothing, deployer has no lingering power, deployed code matches source (full Sourcify match for all 12).
- **Limitations section** recommends a third-party audit before significant TVL growth.
- Out of scope: $KYTE token contract, its trading pool, Uniswap PoolManager, Harmonic oracle, website/indexer/MCP/keeper.

## 3. Decision: how `/audit` is built

**Recommended: a native Next page at `/audit` in the site's design, plus the report HTML served as a static file.**

Why not just serve the HTML at `/audit`? It works, but it is a white-background page with no site nav, footer or wallet bar, and
the nav's active-pill logic expects an in-app route. A native page also lets the Roadmap, Security section and footer link to
it with a consistent look, and gives search engines a proper title/description under the site's layout.

The full HTML report is still published **unchanged**, at `/audit/report.html`, and the page links to it ("Open full report").
Nothing in the report needs editing: it has no scripts, so the strict nonce CSP in `src/proxy.ts` does not block anything
(`style-src 'unsafe-inline'` already allows its inline `<style>`; the one `<svg>` is inline markup, not an image).

### Route and label

- Route: **`/audit`** (as asked). Also add `/security` → `/audit` permanent redirect in `next.config.ts` (`redirects()`), since the
  brief suggested `kyte.sh/security` and people type both.
- Nav label: the report is careful to call itself a self-assessment. Suggested label **"Security"** with the page titled
  "Security self-assessment". If you prefer the label "Audit", keep the H1 and metadata honest ("Security self-assessment"),
  so the nav word never overclaims.

## 4. Files to add / change

### 4.1 Static files (`public/audit/`)
```
public/audit/report.html   ← kyte-security-self-assessment.html (copy, unchanged)
public/audit/kyte-security-self-assessment.pdf
public/audit/kyte-security-self-assessment-raw.zip
```
Keep the long names on the PDF and zip so a downloaded file is self-describing. `public/` is served by Next with the
`securityHeaders` from `next.config.ts` (nosniff, HSTS). The proxy matcher applies CSP to `/audit/report.html` too; fine, no scripts.
Add `brand/` style exclusion is **not** needed.

### 4.2 Page: `src/app/audit/page.tsx` (server component, `metadata` export)
Sections, top to bottom, reusing `PageHeader`, `Stat`, `Note` from `src/components/ui.tsx` and the `hair`/`mono`/`eyebrow` classes:

1. `PageHeader` title "Security self-assessment", sub "Automated analysis, manual review and on-chain checks of the deployed contracts. Version 1.1, 9 November 2026, block 109,974,684."
2. **Three actions** in a row: "Open full report" (`/audit/report.html`, new tab), "Download PDF" (`download` attr), "Raw tool outputs (.zip)".
3. `Note tone="warn"`: "This is a self-assessment by the Kyte team, not a third-party audit. Slither (Trail of Bits) and Aderyn (Cyfrin) are tools; neither company reviewed Kyte. An independent audit is planned." (mirrors the report's own notice and the Limitations section)
4. **Counts strip**: five `Stat`s, Critical 0 · High 0 · Medium 0 · Low 5 · Informational 5.
5. **Findings table** (10 rows): ID, severity badge, title, status. Each row links to `/audit/report.html#KYT-0n` (the report has those anchors).
6. **Scope table** (12 contracts): name, one-line purpose, short address linking to Blockscout, Sourcify match id. Pull addresses from `src/lib/contracts` / `deployments` where they exist so the page cannot drift from the live config; fall back to the report's constants for KyteHook, UniswapV4Adapter, KyteHaltGate and TimelockController if not in the deployments file.
7. **Checks that passed**: the 11 ticks as a two-column list.
8. **Roles**: compact 4-row table (Timelock 600 s, Guardian 1-of-3 pause only, Operations Safe 2-of-3 no permissions, buyback keeper unused).
9. **Verify downloads**: SHA-256 of PDF and zip in `mono`, plus the one-line "Reproduce" summary and a link to the report's §13.
10. Footer line: "Provided for information only. Not an audit, an endorsement or investment advice. Options can expire worthless."

Hardcode the report data in a `const REPORT = {...}` at the top of the file (version, date, block, findings[], scope[], checks[]), so a
v1.2 is a one-object edit. Metadata: `title: Security · Kyte`, description from the report's own `<meta name=description>`,
`robots: index` (unlike privacy/terms, this page should be indexed).

### 4.3 Navigation and cross-links
- `src/components/Nav.tsx` `LINKS`: add `{ href: '/audit', label: 'Security' }` after Proof (before Agent). The desktop bar is
  at 11–12 links already at `max-w-5xl`; check it still fits at 768–1024 px, otherwise drop `Trades` from the nav (it stays in the footer).
- `src/components/Footer.tsx` Protocol column: add `{ h: '/audit', n: 'Security self-assessment' }` after "Proof of burns".
- `src/app/page.tsx`
  - `Security()` section: add a second ghost button "Read the security self-assessment" → `/audit`.
  - `Roadmap()` mainnet branch: insert `{ s: 'Done', done: true, t: 'Security self-assessment', d: 'Slither and Aderyn on every verified contract, manual review and on-chain checks. 0 critical, high or medium findings. Published 9 Nov 2026.' }` before "Next: Audits and bug bounty", and reword that item to "Independent audit and bug bounty".
  - **Copy fix:** bullet 6 in `Security()` says "Buybacks must clear a 10-minute TWAP floor checked on-chain, so even a stolen keeper key cannot sell cheap." The report (KYT-01/02) states the on-chain buyback route is not in use and buybacks are manual. Reword to: "Buybacks are currently executed manually; the on-chain buyback route has a TWAP floor and will be re-pointed before it is switched on." Otherwise the homepage contradicts the report.
- `src/app/docs/page.tsx` Risks section (`id="risks"`): one sentence linking to `/audit`.
- `src/lib/seo.ts`: nothing required; the OG card is site-wide.

### 4.4 The "48 hours" reminder
The brief says to update any page that says 48 hours for the timelock. On the website itself every mention already says
**10 minutes** (`page.tsx` Security bullet 3 and Roadmap). The stale mentions are in docs:

| File | Line | Now says | Change to |
|---|---|---|---|
| `docs/PROJECT_DOCS.md` | 16 | "48 h timelock for settings" | "10-minute timelock for settings (48 h supported by `Deploy.s.sol`, not yet raised)" |
| `docs/PROJECT_DOCS.md` | 66 | "`TIMELOCK` (48 h `TimelockController`…" | "`TIMELOCK` (`TimelockController`, 600 s on mainnet…" |
| `docs/MAINNET_DEPLOY.md` | 32, 47, 55 | script enforces ≥ 48 h; "Wire it through the timelock (48 h)" | Add a note that the live mainnet delay is 600 s (report KYT-04) and the script text describes the target, not the current state |
| `docs/GITBOOK.md` | 750, 1979 | already says "Currently 10 minutes on-chain; `Deploy.s.sol` supports 48 hours" | OK as is. Add a "Security" page to GITBOOK.md pointing at kyte.sh/audit and the PDF, and push it to docs.kyte.sh |
| `docs/INTEGRATIONS_PLAN.md` | 27 | "48 h timelock on buyback funds" | This is about **FOBO's** governance, not Kyte's. Leave it. |

Also from KYT-04: the NatSpec in the contracts' `Governed.sol` ("the timelock (48 h, …)") is wrong for mainnet. It is a comment-only
fix in the contracts repo for the next deploy; no on-chain change.

### 4.5 Config
- `next.config.ts`: add `redirects()` with `/security` → `/audit` (308). No CSP changes: the report links to
  `robinhoodchain.blockscout.com` as plain `<a>` links, which CSP does not govern.
- `src/proxy.ts` matcher: no change. Optionally exclude `audit/` from the matcher like `brand/` to skip the nonce work for static
  downloads; harmless either way.

## 5. Order of work (one commit, straight to main per repo convention)

1. Copy the three files into `public/audit/` (names as in §4.1). `shasum -a 256` must match §1.
2. Create `src/app/audit/page.tsx` with the hard-coded `REPORT` object and the sections in §4.2.
3. Nav, Footer, homepage Security + Roadmap, docs Risks link (§4.3), including the buyback bullet rewording.
4. `/security` redirect in `next.config.ts`.
5. Docs: PROJECT_DOCS.md and MAINNET_DEPLOY.md timelock wording; GITBOOK.md Security page (§4.4).
6. `pnpm typecheck && pnpm build`. Open `/audit`, `/audit/report.html`, both downloads, `/security` redirect, mobile menu.
7. Commit (`feat: /audit security self-assessment page, report + PDF + raw outputs, nav and footer links; homepage copy matches the report`). Push to main; Render auto-deploys the web service.
8. Verify on production: `curl -I https://kyte.sh/audit`, `https://kyte.sh/audit/report.html` (200, `text/html`),
   the PDF (`application/pdf`, ~587 KB) and the zip (~500 KB), and `https://kyte.sh/security` → 308 to `/audit`.
9. Then announce on X and update docs.kyte.sh.

## 6. Open points for Saurabh

- Nav label: "Security" (recommended) or "Audit"? Route stays `/audit` either way.
- Should the Roadmap's "Audits and bug bounty" item name a target (e.g. "after staker rewards v2")? The report recommends an
  independent audit before significant TVL growth; the page should not promise a date we do not have.
- The report says buybacks are manual. Confirm that wording is fine on the homepage (the current bullet implies the on-chain route is active).
- Later versions: when the report is re-issued (v1.2), replace the three files and edit the `REPORT` object. Consider dating the
  file names (`…-2026-11-09.pdf`) if old versions should stay downloadable.
