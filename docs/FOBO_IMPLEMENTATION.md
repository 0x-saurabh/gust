# FOBO on Kyte: what we implemented

Date: 9 Nov 2026. Commit `904fc90` on `main`. Design and rationale: `docs/FOBO_LISTER.md`. Plan: `docs/INTEGRATIONS_PLAN.md` §1.

FOBO (fobo.fun) is the Robinhood Chain launchpad where every token launches with its whole supply as Uniswap v4
liquidity owned by `FoboHook`, and a floor (a buy wall under the price) that only rises. Kyte now lists FOBO tokens
automatically once their floor is big enough, and uses the floor inside the product.

## 1. Smart contract

| What | File | Status |
|---|---|---|
| `FoboLister`: permissionless listing of FOBO tokens through the protocol timelock | `contracts/src/FoboLister.sol` | built, tested, **not yet deployed** |
| Deploy script | `contracts/script/DeployFoboLister.s.sol` | ready |
| Unit tests with a mock hook (16) | `contracts/test/FoboLister.t.sol` | passing |
| Mainnet fork test: lists FOBO and FLORA with puts, refuses FOBRO (2.6 ETH), MARIO ($FOBO-quoted), WETH | `contracts/test/ForkFoboLister.t.sol` | passing (`FORK=1`) |

What the contract checks before it schedules `AssetRegistry.addAssets([token],[cap],[minStrike],putsOn)`:

- the token has an ETH-quoted pool in FoboHook: `pools(keccak256(abi.encode(keyFor(address(0), token)))).token == token`
- it is at least `minAge` old (24 h; past the 60 s launch tax and the first day of trading)
- its floor backs at least `minFloorQuote` (4.2 ETH, the same bar as Pons graduation): `floorOf(key)` → `circulating × 2^192 / sqrtPriceX96²`
- 18 decimals, not already listed
- cap = 2% of supply, minimum strike 1e12 wei, **puts on** (the floor bounds a put writer's loss)

Flow: anyone calls `list(token)` → timelock operation (10 min) → anyone calls `execute(token)`. Cap, min strike and
puts flag are frozen at scheduling. Guardian can pause new listings; timelock changes the bars, the puts default,
and can `reset` a stuck schedule. The lister can only ever propose the `addAssets` it builds itself.

Verified on chain from Sourcify ABIs: `FoboHook.keyFor`, `FoboHook.pools` (15-field getter, read with a raw
staticcall and a prefix decode), `FoboHook.floorOf`, tick spacing 60, FoboFactory `TokenLaunched` event signature.

## 2. Indexer

| What | File |
|---|---|
| FOBO module: launches, floors, quotes, `/fobo/tokens` route, `floorFor(token)` | `indexer/src/fobo.mjs` |
| Wiring: asset rule, offer floor flags, `/prices` floor, install | `indexer/src/index.mjs` |

- Indexes `FoboFactory.TokenLaunched` from block 98,573,000 ($FOBO's own launch, 26 Oct 2026), resumable cursor.
- Polls `FoboHook.floorOf` every 2 minutes for recent (72 h), eligible and listed tokens, plus a slow sweep of
  older ETH-quoted tokens (a floor can grow months after launch). Stores floor tick, floor price in ETH per token,
  ETH the floor backs, circulating supply, eligibility and when it first cleared the bar.
- Prices, market cap, 24h change, liquidity from DexScreener (it indexes the FoboHook pools).
- `/fobo/tokens?status=eligible|near|recent|listed|all&hours=&limit=` with counts and the rule.
- `assetRule()` now returns `source: 'fobo'` for eligible or listed FOBO tokens: 24 h maximum option expiry,
  same as Pons.
- `/prices` carries `floor` and `floorBackingEth` for FOBO tokens.
- Offers carry `floorEth` and `belowFloor` (a put struck at or below the floor).
- Verified end to end against mainnet with a scratch database: 626 launches, 450 ETH-quoted, 4 eligible
  (FOBO 29.4 ETH, FLORA 11.5, LOCKRA 4.5, XOXO 4.3).

## 3. Keeper

| What | File |
|---|---|
| One `jobLister` for both launchpads (Pons and FOBO), `jobFoboList` reads `/fobo/tokens?status=eligible` | `keeper/src/index.mjs` |

Lists when a token clears the bar, executes after the delay, retries hourly on failed checks, keeps pending
schedules even if the indexer is down. Activates once `foboLister` is in `contracts/deployments/4663.json`.

## 4. Site

| What | File |
|---|---|
| Launchpad page: Pons / FOBO switch | `src/components/launchpad/LaunchpadPage.tsx` |
| FOBO list: tabs Clears the bar / Getting close / New (72h) / On Kyte, progress bar to 4.2 ETH, floor, floor backing, circulating, age, links, "Sell a 24h put" / "Trade on FOBO" | `src/components/launchpad/FoboList.tsx` |
| Market: floor as a dashed amber chart line, a floor chip next to the price, "below floor" badge on puts | `src/app/market/page.tsx` |
| Sell: refuses a put at or below the floor, shows the floor next to the strike, "24 h market" label for every launchpad token | `src/app/sell/page.tsx` |
| Types: `source: 'pons' | 'fobo'`, `floorEth` on assets, `floor` on quotes, `belowFloor` on offers | `src/lib/data.ts` |
| Docs page address table: PonsLister and FoboLister rows | `src/app/docs/page.tsx`, `src/lib/chains.ts` |

The contracts stay oracle-free: the floor rules are UI and agent rules only.

## 5. MCP and agent

| What | File |
|---|---|
| `list_graduated` takes `launchpad: 'pons' | 'fobo'`; FOBO branch returns eligibility, floor price, floor backing, floor vs price | `src/lib/agent/tools.ts` |
| `list_tokens`: FOBO note (24 h, floor) | same |
| `get_prices`: `floorEthPerToken`, `floorVsPrice`, `floorBackingEth`, `floorNote` | same |
| `find_offers`, `explain_offer`, `compare_offers`: `launchpad`, `floorEthPerToken`, `belowFloor` with a warning | same |
| `prepare_cash_secured_put`: refuses a strike at or below the floor; 24 h expiry rule | same |
| HOL plugin skill text updated | `scripts/hol/plugin/skills/kyte-options/SKILL.md` |
| Tests with a FOBO fixture (FLORA) | `tests/agent-tools.test.ts` |

## 6. Ops and docs

| What | File |
|---|---|
| Runbook: deploy FoboLister + one Safe tx for timelock roles | `scripts/mainnet/fobo-lister.sh` |
| Timelock roles plan for the Safe | `scripts/mainnet/fobo-lister-roles-plan.mjs` |
| Design doc | `docs/FOBO_LISTER.md` |
| This list | `docs/FOBO_IMPLEMENTATION.md` |
| README docs line, plan status | `README.md`, `docs/INTEGRATIONS_PLAN.md` |

## Checks run

- `forge test`: 181 passing (16 new FoboLister tests), `forge fmt --check` clean
- `FORK=1 forge test --match-contract ForkFoboLister`: 2 passing against mainnet
- `pnpm typecheck`, `pnpm test` (24), `pnpm build`: clean
- pre-push CI hook: all green

## What is left

1. Run `scripts/mainnet/fobo-lister.sh` (deployer keystore + Safe owners). Writes `foboLister` to the deployments
   file; commit and push so Render redeploys the keeper. From then on qualifying tokens list themselves.
2. fobo.fun token page URL confirmed as `https://fobo.fun/?token=<address>` (fixed 9 Nov 2026).
3. Ask FOBO for a partner slot in `FoboRevenue` (referrals credit `tx.origin`, so a frontend cannot earn them) and a
   "Kyte options" link on token pages. Co-post at go-live.
4. Registry room: `MAX_ASSETS` is 300, 247 listed. The 4.2 ETH bar keeps FOBO listings few (4 today).
5. Follow-up, pre-existing: the MCP prepare tools read `minStrike` as per token while the contract applies it to
   the total strike; on tiny-price tokens the agent may refuse legitimate offers.
