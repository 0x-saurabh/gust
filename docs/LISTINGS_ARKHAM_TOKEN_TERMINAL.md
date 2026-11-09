# Arkham and Token Terminal listing forms: what was submitted

Status on 9 Nov 2026. Both forms were filled by hand on 9 Nov 2026 by the Kyte team with the data below; both are free
and both are pending review. This file records exactly what was supplied so a follow-up or a re-submission uses the
same facts. Source of truth for the copy text: `docs/LISTINGS.md`.

| Platform | Form | Status | What it gives us |
|---|---|---|---|
| Arkham Intelligence | Entity / token submission (arkhamintelligence.com, "Submit entity" via the platform) | Entity **submitted 9 Nov 2026**, pending; **address correction sent 9 Nov 2026** (first form listed the v1 markets as v3, see table). Token page already **live** at https://arkm.com/explorer/token/kyte (what it shows: `docs/ARKHAM.md`) | Labelled Kyte entity: contracts, treasury and keeper wallets tagged "Kyte" on Arkham's explorer and on every holder/flow chart |
| Token Terminal | Project listing request (tokenterminal.com, "List your project") | **Submitted 9 Nov 2026**, pending | Fees, revenue, TVL-style and user metrics for Kyte on Token Terminal, next to other derivatives protocols |

## What was submitted (both forms)

**Identity**
- Name: Kyte. Ticker: $KYTE. Category: DeFi → Derivatives / Options. Chain: Robinhood Chain (chain id 4663, Ethereum L2).
- One line: Options on Robinhood Chain, fully collateralised.
- Description: the "Long" text from `docs/LISTINGS.md` (non-custodial covered calls and cash-secured puts, options are
  NFTs, no margin, no liquidations, 30% of fees to stakers, 20% buyback and burn, MCP server, ERC-8004 agent #22541,
  not affiliated with Robinhood).
- Logos: `public/brand/kyte-mark.png` (square), `public/brand/kyte-wordmark.png`.
- Links: https://kyte.sh · https://docs.kyte.sh · https://x.com/useKyte · https://github.com/usekyte-org ·
  https://kyte.sh/proof · https://kyte.sh/audit · Dune dashboard (dune.com/usekyte) · HEY Research
  (heyresearch.xyz/project/kyte).
- Contact: contact@kyte.sh.

**Contracts on Robinhood Chain (all verified on Blockscout)**

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

## Arkham specifics

- Entity type: Protocol (DeFi). Sub-labels requested: "Kyte: CallMarket", "Kyte: PutMarket", "Kyte: FeeVault",
  "Kyte: StakingPool", "Kyte: Keeper" for the live keeper `0x377E…bBd4E`.
- Arkham indexes Robinhood Chain: the $KYTE token page is already live at https://arkm.com/explorer/token/kyte
  (read-out in `docs/ARKHAM.md`), so the entity review is the only thing outstanding. Nothing more to send; check
  the entity search for "Kyte" weekly.

## Token Terminal specifics

- Metrics offered: fees (3% of premium on fill, 0.1% of strike on exercise, all through FeeVault events), revenue split
  (30% stakers, 20% buyback and burn, rest treasury) as shown on kyte.sh/proof, active users (unique traders per day),
  token incentives (UsdgRewards daily USDG epochs).
- Data access offered to their analysts: verified contract ABIs in `usekyte-org/kyte-abis`, the DefiLlama adapter
  (DefiLlama-Adapters PR 22099, same TVL and staking logic), and the Dune queries 9088492 / 9088512.
- Token Terminal prefers DefiLlama coverage first; the open DefiLlama PR is the dependency. Once it merges, reply to
  the Token Terminal ticket with the DefiLlama slug.

## Follow-up

1. Arkham: the token page is live (`docs/ARKHAM.md`); link it from the footer. Search "Kyte" on arkm.com each
   week; when the entity appears, check every contract in the table above carries a "Kyte:" label.
2. Token Terminal: when DefiLlama PR 22099 merges, reply to the ticket with the slug and the Dune dashboard.
3. Both: if either asks for a proof of ownership, use the same pattern as HEY (file under `public/.well-known/` plus
   a meta tag in `src/app/layout.tsx`).
