# Elysium: plan to run Kyte on Kinetiq's Hyperliquid L2

Status 10 Nov 2026: research done, nothing deployed. Elysium mainnet launched 9 Nov 2026 13:00 UTC. This is the
plan to put Kyte's options market there as a second chain next to Robinhood Chain.

## What Elysium is (verified 10 Nov 2026)

| | |
|---|---|
| Builder | Kinetiq (kHYPE liquid staking, Markets.xyz). Site https://elysium.kinetiq.xyz, docs https://elysium.kinetiq.xyz/docs, X @Enter_Elysium |
| Stack | **Arbitrum Orbit** chain operated with Conduit, settling to HyperEVM (chain 999). Same stack as Robinhood Chain, so our contracts, indexer and keeper need no EVM changes |
| Chain id | **99901** (`eth_chainId` on the public RPC returns `0x1863d`) |
| RPC | https://rpc.elysium.kinetiq.xyz (public), Alchemy `elysium-mainnet.g.alchemy.com/v2/{key}` (primary provider), QuickNode, Chainstack |
| Explorer | https://elysium.kinetiq.xyz/explorer. **Sourcify does not list chain 99901 yet** (checked 10 Nov 2026): ask Kinetiq which verifier the explorer uses, or request Sourcify chain support before mainnet |
| Gas | **HYPE**, native, bridged 1:1 from HyperEVM with no wrapper on the bridge path |
| Blocks | 100 to 200 ms, 300 Mgas/s target |
| Bridge | canonical Arbitrum-style bridge: any HyperEVM ERC-20 bridges permissionlessly (first deposit auto-deploys the Elysium token); Wormhole and Enso also live |
| Token | none; no points program |
| Builder revenue share | **25% of sequencer revenue** reserved for apps that drive blockspace demand (user incentives, liquidity, fee rebates). No form; "contact the Kinetiq team" |
| Day-one apps | about 30: Uniswap v2/v3/v4, KyberSwap, 0x, Oku, Nest DEX, Dawn, fomo, Pump.fun, Banana Gun, **Derive V3 (options)**, Markets.xyz, Speculate, launchpads Montra and Citadel. Wallets: OKX, Zerion, MetaMask (custom network) |

Core addresses on Elysium (from the docs, WHYPE confirmed on chain):

| Contract | Address |
|---|---|
| WHYPE (wrapped gas, ERC-20) | `0xbA876237B0F021A6c6D852d6c26E107997cC5E81` |
| USDC | `0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65` (6 decimals) |
| Uniswap v4 PoolManager | `0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1` |
| Uniswap v4 PositionManager | `0x1d1C51b9d07fD27d36412A2b66CC23D19Eb3E518` |
| Uniswap v4 Universal Router 2.2.0 | `0x1B341FDD55d56F8E08409A2C25DDFad93Eb03C1a` |
| Uniswap v4 Quoter / StateView | `0x379F556c5a748BD7Cc9baF0F7A344094Ac1814f5` / `0x27eD73aE0652fdCf71d6793412A7525f32bE9dfE` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| CreateX | `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` |
| Safe L2 singleton / proxy factory | `0x3E5c63644E683549055b9Be8653de26E0B4CD36E` / `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2` |

Not Kinetiq's chain: viem's `elysiumTestnet` (1338) and chainlist "Elysium Mainnet" (1339, PYR) are Vulcan Forged's
network. Never mix them up.

## Why it fits Kyte

- **Same stack.** Robinhood Chain and Elysium are both Arbitrum Orbit. Our Solidity, the Uniswap v4 hook (KyteHook:
  TWAP oracle plus swap fee to the FeeVault) and the v4 adapter deploy unchanged against Elysium's PoolManager.
- **Options demand already proven.** Derive V3 is live there on day one, so Kinetiq wants options venues. Kyte's
  angle is different and complementary: fully collateralised covered calls and cash-secured puts on spot ERC-20s,
  options as NFTs, no margin, no liquidation engine, and an MCP server so agents can trade it.
- **Underlyings people hold.** HYPE (as WHYPE), kHYPE (Kinetiq's LST, the obvious covered-call asset: holders already
  sit on it for yield), every HyperEVM ERC-20 that bridges over, and launchpad tokens from Montra and Citadel (the
  Pons and FOBO playbook: 24 hour options on fresh launches).
- **Money on the table.** 25% of sequencer revenue goes to apps that bring blockspace. Every Kyte fill, exercise,
  expiry and fee split is an L2 transaction; the USDG-rewards style points program can be funded from that share.
- **Early.** About 30 apps on day one and one options venue. Being the second options protocol in week one is
  worth more than being the fortieth DEX.

## What changes in Kyte

The protocol is "WETH-denominated": premiums and put collateral are WETH, the Router wraps ETH, fees split in WETH,
stakers are paid in WETH. On Elysium the gas token is HYPE, so the quote asset becomes **WHYPE**.

| Layer | Change | Effort |
|---|---|---|
| Contracts | none in Solidity. Deploy with `weth = WHYPE`, PoolManager = Elysium's. New Timelock, Guardian, ops Safe (or bridge the existing Safe owners), AssetRegistry listing kHYPE, WHYPE pairs, bridged majors | 1 day (deploy scripts already parameterised by `deployments/<chainId>.json`) |
| $KYTE | decide: (a) bridge KYTE from Robinhood Chain via Wormhole and run a StakingPool + BuybackBurner on Elysium with a KYTE/WHYPE v4 pool, or (b) start with no token on Elysium: 30% staker share accrues to a Safe and is bridged back to the Robinhood Chain StakingPool weekly. **(b) first**, (a) when volume justifies a pool | (b) 0 days, (a) 2 days |
| Indexer | one process per chain today (`CHAIN_ID`, `deployments/<chainId>.json`, SQLite per chain). Run a second Render private service `kyte-indexer-elysium` with `CHAIN_ID=99901`, `RPC_URL`, `START_BLOCK`. Quote-asset label "WHYPE" instead of "WETH" where the API says `Eth` (`volumeEth`, `feesEth`) needs a `quoteSymbol` field | 2 days |
| Keeper | second worker `kyte-keeper-elysium` with its own key funded in HYPE; expiries, split, buyback (or Safe transfer in option b) | half a day |
| Website | multi-chain: chain switcher in the header, per-chain deployments and indexer URL, "ETH" copy becomes the chain's quote symbol, wagmi chain definition for 99901 (name Elysium, HYPE, RPC, explorer), faucet hidden | 3 days |
| Prices | no Robinhood quote API here. Spot comes from Uniswap v4 TWAP (KyteHook) and DexScreener (already indexes Elysium as `chainId: elysium`, 30 WHYPE pairs on 10 Nov); Harmonic session state does not apply (no stock tokens), so `session` is always `open` | 1 day |
| MCP + agent | tools take an optional `chain` argument (default robinhood); `list_tokens`, `find_offers`, `prepare_*` route to the right indexer and build kyte.sh links with `?chain=elysium` | 1 day |
| Rewards | reuse UsdgRewards with USDC (6 decimals) as the reward token, funded from the sequencer revenue share | half a day |
| Listings | DefiLlama: add `elysium` to both adapters once DefiLlama has the chain (they do: PRs for Elysium adapters were merging on 9 Nov); CoinGecko/DexScreener for KYTE if bridged; Kinetiq ecosystem page; Alchemy Dapp Store entry gets a second chain | half a day |

Total: about two weeks of work for one person, with option (b) for the token.

## Risks and open questions

- **Liquidity for exercises.** Puts settle in WHYPE, calls deliver the underlying; neither needs a pool. But the
  spot price shown to writers comes from v4 TWAP, so list only tokens with a real WHYPE pool (kHYPE, bridged majors).
- **Gas in HYPE.** The keeper needs HYPE; set the same low-gas alert. Bridge HYPE from HyperEVM via the canonical
  bridge (the only path with no wrapper).
- **Verification.** Sourcify has no entry for 99901 yet. Open a chain-support request on Sourcify's repo (they add
  Orbit chains routinely) and ask Kinetiq what the explorer accepts; unverified contracts would hurt the HEY and
  DefiLlama listings.
- **Governance.** A second Timelock and Guardian per chain, or Wormhole-relayed governance from the Robinhood Chain
  Safe. Start with a fresh 2-of-3 Safe on Elysium using the same owners.
- **Regulatory posture.** No stock tokens on Elysium, so the Harmonic halt logic and the stock-token disclaimers do
  not apply; the "not affiliated with Robinhood" line stays on the shared site.
- **Builder share.** It is a revenue share, not a grant. Ask Kinetiq what counts as "blockspace demand" and how it
  is paid out before planning rewards around it.

## Sequence

1. **Reach out (this week).** Email or DM Kinetiq (@Enter_Elysium, @kinetiq_xyz) from the Kyte account: options venue
   with a different model from Derive, agent-native via MCP, live on Robinhood Chain since 25 Oct, DefiLlama-listed.
   Ask for: ecosystem page listing, the builder revenue share terms, a kHYPE intro, and testnet HYPE.
2. **Testnet (chain 99801)** in week one: deploy the full set with `weth = WHYPE-testnet`, run indexer and keeper
   locally, list kHYPE and WHYPE, do one covered call and one put end to end.
3. **Website multi-chain** in parallel: chain switcher, quote symbol, wagmi chain, MCP `chain` argument.
4. **Mainnet** in week two: fresh Safe, Timelock, Guardian; deploy; verify; seed 3 to 5 offers (kHYPE covered calls
   are the natural first listing); indexer and keeper on Render; DefiLlama adapters add the chain.
5. **Rewards** once the builder share is confirmed: USDC pool on UsdgRewards (Elysium deploy), same points rules.
6. **Announce** with Kinetiq: "options on kHYPE and HYPE, fully collateralised, agents can trade it".

## Copy for the outreach

> Kyte is a non-custodial, fully collateralised options market (covered calls, cash-secured puts, options as NFTs, no
> margin, no liquidations), live on Robinhood Chain since 25 Oct 2026 and listed on DefiLlama. It runs on Arbitrum
> Orbit with a Uniswap v4 hook, so it deploys to Elysium unchanged with WHYPE as the quote asset. Natural first
> markets: kHYPE covered calls and HYPE cash-secured puts. Every Kyte action is an L2 transaction, and our MCP server
> lets Claude, ChatGPT and Cursor read the market and prepare trades the user signs. We would like to be on the
> ecosystem page and understand the builder revenue share. Contact: contact@kyte.sh.

Sources: Kinetiq docs (connecting, contract addresses, token bridging), Uniswap v4 deployments page (Elysium 99901),
GlobeNewswire launch release 9 Nov 2026, Chainstack and QuickNode launch posts, chainlist entry 99901.
