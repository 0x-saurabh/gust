# HEY Research: what Kyte put on record, what HEY said back, what to do

Status on 9 Nov 2026. HEY Research Lab (heyresearch.xyz) tracks builders by evidence: code weeks, GitHub
releases, launchpad stamps, owner proofs and registered sources. Kyte's page: https://heyresearch.xyz/project/kyte

## 1. What we did on HEY (chronological)

| Date (UTC) | What | Where it lives |
|---|---|---|
| 8 Nov | Claimed the project page. Ownership proof `3DLbtlOqbaJ3uk6fopXO0WGgFAE5foMc` served at `kyte.sh/.well-known/hey-research.txt` and as a meta tag in `src/app/layout.tsx`. HEY marks Kyte **Verified Builder**. | gust commit `096f873` |
| 8 Nov | Footer link "HEY Research" on every kyte.sh page. | gust commit `953f333` |
| 8 Nov | `CHANGELOG.md` added to `usekyte-org/kyte-mcp`: a dated record of every ship since mainnet (25 Oct) written for HEY and other indexers. | kyte-mcp commit "CHANGELOG: dated record of what shipped" |
| 8 Nov | HEY badge (`heyresearch.xyz/api/badge/kyte`) and contract addresses in the kyte-mcp README. | kyte-mcp README |
| 8 Nov | 22 sources registered: kyte.sh, ~11 docs.kyte.sh pages, 6 GitHub repos / org pages, 3 Blockscout contract pages, @useKyte on X. One audit report (the Kyte self-assessment, kyte.sh/audit). | HEY sources tab |
| 8–9 Nov | Three "updates" submitted by hand: **Kyte MCP server v1.0.0** (dated 7 Nov), **Oak Agent Kit recipes** `kyte-oak-recipes` on npm (8 Nov), and the **launchpad update** (PonsLister / FOBO listing, 24-hour options). | HEY updates tab; see section 3 |
| 9 Nov | Agreed a posting window with HEY: **16:30 to 17:30 UTC**. HEY will quote the post once it is up. | X DM (screenshot) |

## 2. What HEY shows about Kyte today (read 9 Nov 2026)

- Verified Builder, tag "AI Agents", status **Shipping**, last shipped yesterday.
- Contract on record: $KYTE `0x072d88c2f31f568c0f4b8f613692eb489541ed45`, Robinhood Chain (4663).
- **Counted ships in 30 days: 2.** The code week of 2–8 Nov in `kyte-mcp` (7 commits) and the feature release
  "PonsLister and Launchpad" (permissionless listing of graduated Pons tokens with 24-hour options).
- Other code weeks: single "Initial release" commits in `kyte-abis`, `Kyte-Market`, `Kyte-StakingPool`, `kyte-contract-v2`.
- **Recorded, not counted:** Oak Agent Kit recipes (8 Nov) and Kyte MCP server v1.0.0 (7 Nov).
- GitHub releases: **0**. Published packages: "Not enough yet" (none confirmed as ours).
- Updates: 14 changes on record (official source change, token check change, owner proofs).
- Launchpad / Token Passport: one stamp, **Launched via Pons, graduated 6 Nov 2026**.
- X: 20 posts in 90 days (Pons Graduate Market, MCP server, Kyte Agent, Dune dashboard), marked uncorroborated.
- Names in code: tokens of 7 projects (ApeCoin, Artificial Inu, Cash Cat, Orbio.so, Pons, StonkBrokers Desks, Virtuals Protocol).

| Score | Value |
|---|---|
| Build Momentum | 40 (Shipping 38, Consistency 17, Significance 26, Evidence 85, Sources 100) |
| Builder Radar | #99 (Development 24, On-chain use 82, Research standing 100, Overall 47) |
| Public code activity | 24/100, 2 of 60 days active, 2 contributors |
| Discovery Gap | 12.1: building ahead of 96.2% of comparable projects, attention ahead of 84.2% |
| Product usage | 4 of 4 watched contracts active, 223 contract-function calls (32,440 calls total incl. transfers/approvals) |
| Coverage | 17 of 19 research dimensions answerable |
| Gaps HEY lists | Published packages, API description |

## 3. HEY's reply (9 Nov) and what it means

Verbatim:

> 16:30 to 17:30 UTC works. We'll quote it once it's up.
> On the updates: kyte-mcp's commits already count on your page as code weeks; it's your latest ship.
> So a separate "v1.0.0" update would count the same work twice. If you cut a GitHub release v1.0.0 in kyte-mcp,
> HEY records it as a release automatically, with its own source.
> The recipes package doesn't count as a ship on its own, because we don't count a package publish by itself.
> The launchpad update we'll check by hand.

Meaning, item by item:

1. **Posting window agreed.** Post from @useKyte between 16:30 and 17:30 UTC; HEY quotes it. Nothing else to send them.
2. **"v1.0.0" update is rejected as a duplicate**, not as false. The commits are already the counted ship.
   The way to get v1.0.0 counted on its own is a **GitHub Release** in `usekyte-org/kyte-mcp`. HEY picks it up
   automatically and it becomes a separate source. Today the repo has 0 releases and 0 tags.
3. **Recipes package: no action possible.** A bare npm publish is never a ship on HEY. It stays "recorded, not counted".
   It would count only as part of a code week or a release in a repo HEY watches (the recipes live in gust, which is
   private, so they will not).
4. **Launchpad update: wait.** HEY reviews it manually. The on-chain evidence is already there (PonsLister, FoboLister
   `0xb30890A6A803D2d0aD76Dd9f1aB327d3b0DE84e4`, UsdgRewards `0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956`).

## 4. Do we have to do something? Yes, two things

**A. Cut GitHub release v1.0.0 in kyte-mcp** (the only action HEY asked for). Tag the commit that shipped the server
(7 Nov) or simply the current head, with the 7 Nov CHANGELOG entry as the body:

```sh
gh release create v1.0.0 -R usekyte-org/kyte-mcp \
  --title "Kyte MCP v1.0.0" \
  --notes "Kyte MCP server v1.0.0 at https://kyte.sh/api/mcp: 20 tools (14 read, 6 prepare), 6 resources, 3 prompts; stateless Streamable HTTP, no login. Plugin manifests for Claude Code, Codex, Cursor and Gemini. MCP page: https://kyte.sh/mcp. Changelog: CHANGELOG.md"
```

Result on HEY: "GitHub releases: 1", a new source, and the v1.0.0 line moves from "recorded" to counted. Future
ships (Harmonic session state, FOBO lister, USDG rewards) should each get a tagged release the same day; releases
are what lifts the Consistency (17) and Significance (26) components.

**B. Post on X between 16:30 and 17:30 UTC today** so HEY can quote it. Suggested content: the HEY Verified Builder
page itself, or the v1.0.0 release once A is done (then the post and the release corroborate each other).

Not needed: resubmitting the v1.0.0 update, anything for the recipes package, chasing the launchpad update.

Nice to have (closes HEY's two listed gaps): publish `kyte-mcp` as an npm package from the watched repo so
"Published packages" is confirmed, and add an API description (the MCP tool list) to a registered source.

## 5. Video fact sheet (verified 9 Nov 2026)

Use only these numbers on screen; each one is on the HEY page or in the repos.

- Kyte is a **Verified Builder** on HEY Research Lab, status **Shipping**.
- **Sources 100/100** and **Evidence 85/100**: 22 registered sources, owner proof on kyte.sh, audit on record.
- **Research standing 100** on Builder Radar; **On-chain use 82**.
- **Discovery Gap 12.1**: building ahead of 96% of comparable projects, attention ahead of 84%. That gap is the story:
  more shipped than noticed.
- **4 of 4 watched contracts active**, 223 contract-function calls.
- Launchpad stamp: **launched via Pons, graduated 6 Nov 2026**.
- What HEY counts: code weeks and GitHub releases, not npm publishes and not tweets. Kyte's counted ships: the
  kyte-mcp code week (7 commits) and the PonsLister / Launchpad feature.
- What is coming: v1.0.0 GitHub release of the MCP server (20 tools, 14 read, 6 prepare), FOBO launchpad with
  24-hour options, USDG trading rewards.

Shot order suggestion: HEY page hero (Verified Builder badge) → Scores panel (Sources 100, Evidence 85) →
Discovery Gap card → kyte.sh footer link and `/.well-known/hey-research.txt` → kyte-mcp CHANGELOG → close on the
v1.0.0 release page.

Disclaimers for the end card: options are risky and can expire worthless; HEY notes an audit is not a guarantee of
safety; Kyte is not affiliated with Robinhood.
