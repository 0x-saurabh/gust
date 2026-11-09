# Arkham and Token Terminal listing forms: what was submitted

Status on 9 Nov 2026. Both forms were filled by hand on 9 Nov 2026 (Saurabh) with the data below; both are free
and both are pending review. This file records exactly what was supplied so a follow-up or a re-submission uses the
same facts. Source of truth for the copy text: `docs/LISTINGS.md`.

| Platform | Form | Status | What it gives us |
|---|---|---|---|
| Arkham Intelligence | Entity / token submission (arkhamintelligence.com, "Submit entity" via the platform) | **Submitted 9 Nov 2026**, pending | Labelled Kyte entity: contracts, treasury and keeper wallets tagged "Kyte" on Arkham's explorer and on every holder/flow chart |
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
- Contact: founder email (Saurabh).

**Contracts on Robinhood Chain (all verified on Blockscout)**

| Contract | Address |
|---|---|
| KYTE token | `0x072D88c2F31F568C0F4B8F613692eB489541Ed45` |
| CallMarket (v3) | `0x459cF18A424271A417547F6B349e962c09e492EE` |
| PutMarket (v3) | `0xD1a3c2Fa0E7901437929B7518AD66d71B1d676a4` |
| Router | `0xe17887A4BA9a373ec94a00D5F0c812fa6a994Ad4` |
| OptionNFT | `0x71B515C3786bF8897368f548d5DbBc2423E73391` |
| StakingPool | `0xD7253a90fd43507F44cF0934F3D5d7432760d17f` |
| FeeVault | `0x78c569A1137B78cB78F42c42B4B6C2b8F1E3dDef` |
| UsdgRewards | `0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956` |
| FoboLister | `0xb30890A6A803D2d0aD76Dd9f1aB327d3b0DE84e4` |
| Uniswap v4 PoolManager / KyteHook | `0x8366a39CC670B4001A1121B8F6A443A643e40951` / `0x77e52E93Aa0892b29a4527Af4f3a79F01cfa9044` |

## Arkham specifics

- Entity type: Protocol (DeFi). Sub-labels requested: "Kyte: CallMarket", "Kyte: PutMarket", "Kyte: FeeVault",
  "Kyte: StakingPool", "Kyte: Keeper" for the live keeper `0x377E…bBd4E`.
- Arkham labels only chains it indexes. Robinhood Chain is an Arbitrum Orbit L2; if Arkham has not added it yet the
  submission sits until they do. Nothing more to send; check the entity search for "Kyte" weekly.

## Token Terminal specifics

- Metrics offered: fees (3% of premium on fill, 0.1% of strike on exercise, all through FeeVault events), revenue split
  (30% stakers, 20% buyback and burn, rest treasury) as shown on kyte.sh/proof, active users (unique traders per day),
  token incentives (UsdgRewards daily USDG epochs).
- Data access offered to their analysts: verified contract ABIs in `usekyte-org/kyte-abis`, the DefiLlama adapter
  (DefiLlama-Adapters PR 22099, same TVL and staking logic), and the Dune queries 9088492 / 9088512.
- Token Terminal prefers DefiLlama coverage first; the open DefiLlama PR is the dependency. Once it merges, reply to
  the Token Terminal ticket with the DefiLlama slug.

## Follow-up

1. Arkham: search "Kyte" on platform.arkhamintelligence.com each week; when the entity appears, add the link to
   `docs/LISTINGS.md` and the kyte.sh footer.
2. Token Terminal: when DefiLlama PR 22099 merges, reply to the ticket with the slug and the Dune dashboard.
3. Both: if either asks for a proof of ownership, use the same pattern as HEY (file under `public/.well-known/` plus
   a meta tag in `src/app/layout.tsx`).
