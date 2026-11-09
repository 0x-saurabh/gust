# Listings (all free)

Status on 9 Nov 2026. Copy-paste text for the forms that need a human account. Logos: `public/brand/kyte-mark.png`
(square), `public/brand/kyte-wordmark.png`, OG image per `src/lib/seo.ts`.

| Where | Status | Link |
|---|---|---|
| DefiLlama (TVL + staking adapter) | **PR open** | https://github.com/DefiLlama/DefiLlama-Adapters/pull/22099 |
| Hermes plugin catalog | **PR open** | https://github.com/NousResearch/hermes-agent/pull/151992 |
| Official MCP Registry (`sh.kyte/kyte`) | see `scripts/mcp-registry/README.md` | https://registry.modelcontextprotocol.io |
| Glama, PulseMCP, GitHub MCP Registry | Auto-import from the official registry | — |
| DappRadar | **Needs your account** (steps below) | https://dappradar.com/dashboard (Submit Dapp) |
| Alchemy Dapp Store | **Needs your account** | https://www.alchemy.com/dapps/submit |
| CoinGecko ($KYTE) | **Needs your account** | https://www.coingecko.com/en/coins/new |
| Smithery, mcp.so | Optional, free queue | smithery.ai, mcp.so |
| Entropy Advisors Robinhood dashboard | Email | arbdata.com/ecosystems/robinhood |
| Robinhood chain developers | Email intro | chain-developers-group@robinhood.com |

Already live: ERC-8004 #22541 (8004scan), HOL registry, HEY Research, Dune, GitBook, Blockscout verified contracts, npm `kyte-oak-recipes`, GitHub tap `usekyte-org/hermes-kyte`.

## Copy text

**Name:** Kyte

**One line (≤60):** Options on Robinhood Chain, fully collateralised.

**Short (≤100):** Non-custodial covered calls and cash-secured puts on Robinhood Chain. Options are NFTs; no margin, no liquidations.

**160 chars (DappRadar):** Non-custodial options market on Robinhood Chain. Write covered calls or cash-secured puts, buy them as NFTs. Fully collateralised: no margin, no liquidations.

**Long:**
Kyte is a non-custodial, fully collateralised options market on Robinhood Chain (chain id 4663). Sellers lock the full collateral when they create an offer: the underlying token for a covered call, the full strike in WETH for a cash-secured put. Buyers pay a premium in WETH and receive the option as an NFT they can hold, transfer or exercise before expiry. There is no leverage, no margin and no liquidation engine; the contracts can only move collateral to the seller (expiry, cancel) or the holder (exercise). Markets cover Robinhood Stock Tokens (NVDA, AAPL, TSLA, SPY and more, with a live trading-session state from Harmonic Agent), tokenised assets, and launchpad tokens from Pons and FOBO with 24-hour options. $KYTE stakers receive 30% of protocol fees; 20% buys back and burns $KYTE; every fee split is on the public proof page. Kyte ships an MCP server (kyte.sh/api/mcp) so Claude, ChatGPT, Cursor, Claude Code and Hermes Agent can read the market and prepare trades the user signs in their own wallet, and an Autopilot that watches signed rules and prepares each action for signature. Kyte is ERC-8004 agent #22541 on Robinhood Chain. Options are risky and can expire worthless. Kyte is not affiliated with or endorsed by Robinhood.

**Category:** DeFi → Derivatives / Options. **Chain:** Robinhood Chain (4663). **Token:** $KYTE `0x072D88c2F31F568C0F4B8F613692eB489541Ed45`.

**Links:** https://kyte.sh · https://docs.kyte.sh · https://x.com/useKyte · https://github.com/usekyte-org · https://kyte.sh/proof · https://kyte.sh/audit

**Contracts (DappRadar asks for them):** CallMarket `0x459cF18A424271A417547F6B349e962c09e492EE`, PutMarket `0xD1a3c2Fa0E7901437929B7518AD66d71B1d676a4`, Router `0xe17887A4BA9a373ec94a00D5F0c812fa6a994Ad4`, OptionNFT `0x71B515C3786bF8897368f548d5DbBc2423E73391`, StakingPool `0xD7253a90fd43507F44cF0934F3D5d7432760d17f`, FeeVault `0x78c569A1137B78cB78F42c42B4B6C2b8F1E3dDef`, KYTE `0x072D88c2F31F568C0F4B8F613692eB489541Ed45`, UsdgRewards `0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956`.

## DappRadar, step by step

1. dappradar.com → Sign in (wallet or email) → Developer dashboard → **Submit Dapp**.
2. Name `Kyte`, category DeFi, chain Robinhood Chain (if the chain is missing, pick "Other" and name it in the description; DappRadar adds chains on request).
3. Logo: `public/brand/kyte-mark.png`. Cover: the OG image.
4. Short description: the 160-char line. Full description: the long text.
5. Website, X, GitHub, docs from the links above. Contracts from the list above.
6. Submit. Approval is usually within a day or two; the listing is free, Premium is optional and not needed.

## Alchemy Dapp Store

Form at alchemy.com/dapps/submit: name, URL, chain Robinhood Chain, category DeFi, the ≤100 summary, logo. Alchemy is Robinhood's recommended RPC partner, so this listing shows up in their Robinhood Chain section.

## CoinGecko

Request form for $KYTE: contract above, chain Robinhood Chain, Uniswap v4 pool (PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951`, KyteHook `0x77e52E93Aa0892b29a4527Af4f3a79F01cfa9044`), website, X, explorer link. Free; CoinGecko is Robinhood Chain's official data partner.
