# FOBO on Kyte: FoboLister, the floor, and the 24 h rule

[FOBO](https://fobo.fun) is the second launchpad on Robinhood Chain (contracts: github.com/fobodotfun/contracts, Coinsult
audit 30 Oct 2026). Every token launches with its whole 1e9 supply as Uniswap v4 liquidity owned by `FoboHook`, which
nobody can withdraw, and a **floor**: a wall of buy liquidity under the price, sized to buy back every token held outside
the pool, raised once per block and only ever up. There is no bonding curve and no graduation.

Kyte lists FOBO tokens the way it lists Pons tokens (`docs/PONS_LISTER.md`), with the floor as the bar instead of
graduation, and uses the floor in the product: a put struck at or below the floor can never finish in the money, so
Kyte shows the floor on the chart, tags such puts and refuses to list them.

## The bar

`contracts/src/FoboLister.sol` lets anyone list a FOBO token without a signature from the team once it passes every
check on chain:

| Check | Source |
|---|---|
| launched by FOBO (an ETH-quoted pool exists in the hook) | `FoboHook.pools(keccak256(abi.encode(keyFor(address(0), token)))).token == token` |
| quoted in ETH | `keyFor(address(0), token)`: currency0 is ETH |
| at least `minAge` old (24 h: past the 60 s launch tax and the first day of trading) | `pools(id).launchedAt` |
| the floor backs at least `minFloorQuote` (4.2 ETH, the Pons graduation bar) for the circulating tokens | `FoboHook.floorOf(key)` → `circulating × 2^192 / sqrtPriceX96²` (`floorBacking`) |
| 18 decimals | `token.decimals()` |
| not already listed | `registry.getAsset(token).listed` |

Cap = `capBps` of total supply (2%). Minimum strike = `minStrike` (1e12 wei). **Puts are on** (`putsOn`, timelock can
change it): the floor bounds a put writer's loss, which is the reason to write puts on these tokens at all. All three
are frozen at scheduling, so execution replays exactly what was scheduled.

Flow: `list(token)` schedules `AssetRegistry.addAssets([token],[cap],[minStrike],putsOn)` through the timelock (10
min), `execute(token)` runs it. The keeper does both from the indexer's `/fobo/tokens?status=eligible`. The guardian can
`pause()` new listings; the timelock changes the cap formula, the bars, the puts default and the minimum strike, and can
`reset(token)` a schedule that can never execute (the timelock cancelled it, or the registry is full: `MAX_ASSETS` is 300
and 247 are listed, so the bar matters).

On 9 Nov 2026 four tokens cleared it: FOBO (floor backs 29.4 ETH), FLORA (11.3), LOCKRA (4.5), XOXO (4.3). 450 of the
626 launches so far are ETH-quoted.

## Off chain

- `indexer/src/fobo.mjs`: indexes `FoboFactory.TokenLaunched` from block 98,573,000, polls `floorOf` every two minutes
  for recent (72 h), eligible and listed tokens plus a slow sweep, prices from DexScreener (it indexes FoboHook pools),
  serves `/fobo/tokens?status=eligible|near|recent|listed|all`. Exposes `floorFor(token)` to the main indexer.
- `indexer/src/index.mjs`: `assetRule()` tags FOBO tokens `source: 'fobo'` with the 24 h option limit; `/prices` carries
  `floor` and `floorBackingEth`; offers carry `floorEth` and `belowFloor` (puts struck at or below the floor).
- `keeper/src/index.mjs`: one `jobLister` for both launchpads (`ponsLister`, `foboLister` in the deployments file).
- Site: Launchpad page has a Pons / FOBO switch (`src/components/launchpad/FoboList.tsx`); the Market page draws the
  floor as a dashed amber line and badges "below floor" puts; the Sell page refuses a put at or below the floor and
  shows the floor next to the strike. The contracts stay oracle-free: these are UI rules.
- MCP: `list_graduated` takes `launchpad: 'pons' | 'fobo'`; `list_tokens`, `get_prices`, `find_offers`, `explain_offer`
  and `compare_offers` carry the floor and the below-floor warning.

## Tests

- `forge test --match-contract FoboListerTest`: 16 unit tests with a mock hook (floor math, bars, puts default, frozen
  terms, reset, pause, admin).
- `FORK=1 forge test --match-contract ForkFoboLister`: mainnet fork with the real timelock, the live v3 registry and the
  real hook; lists FOBO and FLORA with puts, refuses FOBRO (2.6 ETH backed), MARIO ($FOBO-quoted) and WETH.
- `pnpm test`: the agent tools against a FOBO fixture.

## Deploy and wire (once, from the Mac)

```bash
cd /Volumes/my_files/newii/gust-website && scripts/mainnet/fobo-lister.sh
```

1. `forge script DeployFoboLister` with the deployer keystore; the address is written to
   `contracts/deployments/4663.json` as `foboLister`.
2. One Safe transaction through the timelock grants the lister `PROPOSER_ROLE` and `EXECUTOR_ROLE`
   (`scripts/mainnet/fobo-lister-roles-plan.mjs` plus `safe-run.mjs auto`).
3. Commit the deployments file and push. The Render keeper (`kyte-keeper-v2`) needs `INDEXER_URL` (already set for Pons).

From then on: a token's floor crosses 4.2 ETH, the indexer sees it within two minutes, the keeper calls `list`, ten
minutes later `execute`, and the Launchpad card flips from "Listing in 10 min" to "On Kyte".

## Ask FOBO

- A partner slot in `FoboRevenue` for Kyte: referrals credit `tx.origin`, so a frontend cannot earn them; partners can.
- A "Kyte options" link on each token page, as Pons has.
- Co-post at go-live.

## Audit note

Same shape as PonsLister: one external state-changing path besides admin setters, OpenZeppelin's TimelockController
for the delay, no funds ever held. New surface: the raw `staticcall` into `pools(id)` (a prefix decode of the 15-field
getter) and `floorBacking` (two `Math.mulDiv`, no overflow for any uint160 price and uint256 supply ≤ 1e27).
