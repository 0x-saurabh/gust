# Arkham: the $KYTE token page is live

Status on 9 Nov 2026. Arkham Intelligence indexes Robinhood Chain and has a token page for $KYTE:

**https://arkm.com/explorer/token/kyte**

Arkham picked the token up from chain data on its own. The entity submission we filed on 9 Nov (see
`docs/LISTINGS_ARKHAM_TOKEN_TERMINAL.md`) is still pending; it is what turns our raw contract addresses into
"Kyte: …" labels on this page and on every holder and flow chart. Two separate things:

| | State | What it means |
|---|---|---|
| Token page `arkm.com/explorer/token/kyte` | **Live** | Price, supply, market cap, top holders, transfers, GeckoTerminal chart. Linkable today. |
| Kyte entity labels | **Pending** (submitted 9 Nov 2026) | StakingPool, FeeVault, markets, keeper show as bare `0x…` until Arkham approves the entity. |

## What the page shows (read 9 Nov 2026, public view, not logged in)

| Field | Value |
|---|---|
| Name / ticker | Kyte / KYTE |
| Address | `0x072D88c2…` (= `0x072D88c2F31F568C0F4B8F613692eB489541Ed45`, Robinhood Chain 4663) |
| Price | $0.0000721 (+31.25% 24h) |
| 24h volume | $27,312 |
| Market cap = FDV | $72,110 |
| Current supply = max supply | 1,000,000,000 |
| ATH / ATL | $0.0000950 / $0.0000480 |
| 7d / 30d / 180d change | not yet available (too little history) |
| Price source | GeckoTerminal tab (Uniswap v4 pool via our hook) |
| Entity balance changes | "No results found" at the ≥ $100k filter; nothing on the token moves at that size yet |

**Top holders** (page 1 of 2; Arkham labels in bold):

| Rank | Holder | KYTE | % |
|---|---|---|---|
| 1 | **Uniswap: PoolManager** `0x836…` (v4 pool liquidity) | 159,857,507 | 15.99% |
| 2 | **PonsV2LaunchLocker** `0x267…` (locked launch liquidity from the Pons graduation, 6 Nov) | 81,632,653 | 8.16% |
| 3 | `0x6a4CBc33…` | 39,885,702 | 3.99% |
| 4 | **"bigwarzeth" on Fomo** `0xD33…` | 35,942,919 | 3.59% |
| 5 | `0xE1D3DEAB…` | 35,294,290 | 3.53% |
| … | | | |
| 14 | `0xD7253a90…` = **our StakingPool**, unlabelled | 13,396,034 | 1.34% |

Arkham already resolves a handful of holders to Fomo / OpenSea / ENS identities (bigwarzeth, Ckoptimus,
bigslime, DegenSaw, SamFlintstone, metaphilosopher.eth). None of the Kyte contracts is labelled yet. The keeper
`0x377E…bBd4E` does not appear in the top 50; it holds gas, not KYTE.

The **Transfers** panel is blurred behind "Join Arkham" for logged-out visitors and the placeholder rows are not
Kyte data (they are generic ETH rows). Logged-in users see the real transfer feed.

## What this gives us

- A neutral third-party page for the token with live price, supply and holder distribution that we did not write.
  Good for the footer, the docs "Contracts" page, press and listing forms that ask for an "explorer / analytics link".
- Holder concentration in one glance: Uniswap pool 16%, Pons locker 8%, StakingPool 1.3%, no single wallet above 4%.
  That is the number to quote when someone asks "who holds KYTE".
- Arkham's **Visualize** tool and alerts work on the token already (account needed). Once the entity is approved,
  FeeVault → StakingPool → buyback flows will show as named Kyte-to-Kyte edges.

## To do

1. **Link it.** Add "Arkham" next to "HEY Research" in `src/components/Footer.tsx` (Protocol column) and to the
   explorer links in GitBook (`docs/GITBOOK.md`, contracts table). Add the URL to the "Already live" line of
   `docs/LISTINGS.md` (done in this change) and to the CoinGecko / DappRadar forms when those are filed.
2. **Entity labels.** Keep checking `arkm.com` search for a "Kyte" entity weekly. When approved, confirm these are
   labelled: KYTE token, CallMarket, PutMarket, Router, OptionNFT, StakingPool, FeeVault, UsdgRewards, FoboLister,
   KyteHook, keeper `0x377E…bBd4E`. If Arkham asks for proof of ownership, reuse the HEY pattern
   (`public/.well-known/` file plus a meta tag in `src/app/layout.tsx`).
3. **Logo.** The page shows Arkham's auto-generated "Kyte" tile. Ask for `public/brand/kyte-mark.png` on the token
   when the entity goes through (the entity form had the logo attached).
4. **Do not quote the price history yet.** 7d/30d read "-" until the token has that much history on Arkham;
   the ATH/ATL above cover only the days since the Pons graduation.

## Addresses on record (for the entity reviewer)

| Contract | Address |
|---|---|
| KYTE token | `0x072D88c2F31F568C0F4B8F613692eB489541Ed45` |
| CallMarket (v3, current) | `0xb6759D8893601BB7c1A032eC8ea40C856a6adf80` |
| PutMarket (v3, current) | `0x2E2d5DfB4cf30d15688Cc2DDD30641c78DFfcb35` |
| Router (v3) | `0xdD76956667E6423bAC56d2EbF827a9b0d7dBDF68` |
| OptionNFT (v3) | `0xE0CD21A7Ed37898A5ACdF7Dc68C52259Cd63308B` |
| AssetRegistry (v2/v3) | `0x02f571e10B9c7303EB7A6284A7137b146e18658D` |
| StakingPool | `0xD7253a90fd43507F44cF0934F3D5d7432760d17f` |
| FeeVault | `0x78c569A1137B78cB78F42c42B4B6C2b8F1E3dDef` |
| BuybackBurner | `0x8A9d128247D8c4512411CF9D0CdCAc5Acf86FB95` |
| UsdgRewards (current) | `0xA6777B8D42FAad0D92fF0C24F391b0F82Fad69fC` |
| UsdgRewards (legacy, still has unclaimed balances) | `0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956` |
| FoboLister | `0xb30890A6A803D2d0aD76Dd9f1aB327d3b0DE84e4` |
| KyteHook | `0x77e52E93Aa0892b29a4527Af4f3a79F01cfa9044` |
| Ops Safe (treasury) | `0xd97693DF18dd20b8C7A542ea0E167c75F630aDA5` |
| Keeper (live, kyte-keeper-v2) | `0x377E8Ac104351173A1009Eb6bdCd9966174bBd4E` |
| v2 CallMarket / PutMarket (settling old positions) | `0x15B5d324960234B193246B122C555e88E341eD72` / `0x1025f5b1f7549a1192226ddC0D36E1359A8D1305` |
| v1 CallMarket / PutMarket (settling old positions) | `0x459cF18A424271A417547F6B349e962c09e492EE` / `0xD1a3c2Fa0E7901437929B7518AD66d71B1d676a4` |

Pitfall: the indexer `/health` payload and the top level of `contracts/deployments/4663.json` list the **v1** markets
under the bare keys `callMarket` / `putMarket`; the current markets are under the `v3` key. The 9 Nov entity
submission copied the top-level keys and so sent the v1 markets, old router, old NFT and the old UsdgRewards
as "v3". A correction with the table above was sent to Arkham on 9 Nov 2026.

Contact for Arkham: contact@kyte.sh.
