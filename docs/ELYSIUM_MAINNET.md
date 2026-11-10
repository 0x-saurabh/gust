# Kyte on Elysium mainnet: what was built and how

Record of the Elysium launch, 10 Nov 2026. The plan and research live in `docs/ELYSIUM.md`; this file is the "what
runs today, where, and how to operate it" view. Elysium is Kinetiq's Hyperliquid L2 (Arbitrum Orbit, settles to
HyperEVM, gas in HYPE, chain id **99901**, mainnet since 9 Nov 2026).

## 1. What is live

Kyte's option markets on Elysium with **WHYPE** as the quote asset: covered calls lock the underlying, cash-secured
puts lock WHYPE, premiums are paid in WHYPE, the Router wraps native HYPE. Same Solidity as Robinhood Chain, no
code changes in the contracts that trade. Four underlyings are listed with puts enabled.

| Contract | Address |
|---|---|
| TimelockController (10 min delay, admin Safe is proposer and executor) | `0x9F2870E6B0A32546CE6A196a52c88249442FA4A6` |
| AssetRegistry | `0x46C668199e07eDD479A9309B0866cD6900E88bdD` |
| OptionNFT | `0x75D101576Bf681fc231D7Cb92FD8181d424E0e2a` |
| FeeVault | `0x8Ee4A77DaEABe3B68d70a1234E4af25723414867` |
| CallMarket | `0x5965ab9b7FE7119d909f1e63B6Ad0e72a62715FA` |
| PutMarket | `0xF046b23b90ca6355DFD831532778285F1d784aEa` |
| Router (wraps HYPE to WHYPE) | `0xd31d758c4Ff9002Cb1165FF980A4f446BdD343f7` |
| RewardSink (stands in for StakingPool and BuybackBurner) | `0x69486E5cC67918aA5Bc565C4207Be4371C7FaCA6` |
| WHYPE (quote asset, Kinetiq's) | `0xbA876237B0F021A6c6D852d6c26E107997cC5E81` |
| Uniswap v4 PoolManager (recorded, not used yet) | `0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1` |

Deployed at block 3,712,655 by the deployer `0xBeeda2b3Ca61F39bc597Ea056D68268b81cc3323`. The record is
`contracts/deployments/99901.json`; the site, indexer and keeper read it through `src/lib/generated/deployments.json`.

Governance (Safe v1.3.0 on Elysium, same three owners as Robinhood Chain):

| Role | Safe | Threshold |
|---|---|---|
| Admin (timelock proposer/executor) | `0x5fbdC65cbC8543D79338D4a819628654D72C99BA` | 2 of 3 |
| Guardian (pause, disable, revoke) | `0x194b9b6F88de75DdB2d5a6F3e55F4Fd04A950e41` | 1 of 3 |
| Ops (receives the 50% ops share) | `0xc7f8c6063566eaE898b102CF24b701e8a75e421e` | 2 of 3 |

Listed tokens (calls and puts), chosen from the deepest WHYPE pairs on DexScreener on 10 Nov:

| Token | Address | cap | minStrike |
|---|---|---|---|
| KNTQ (Kinetiq) | `0xe45a355d9e9cAd2aD85F2d03E3eE3102A036acF0` | 10,000,000 | 0.001 WHYPE |
| e/acc | `0x8df4f39d592de2aAee15838B265C2392d19A4128` | 10,000,000 | 0.001 WHYPE |
| AETHER | `0xf31BceD2eA8F160052D54c8a3fD03381FEDD8E0D` | 10,000,000 | 0.001 WHYPE |
| A/ACC | `0xAACC5bc6EA24CB753E5C2D48C88f7e361a50AACC` | 10,000,000 | 0.001 WHYPE |

Fees: 3% of the premium on fill, 0.1% of the strike on exercise, in WHYPE, into the FeeVault. Split per epoch:
30% + 20% to the RewardSink (the staker and buyback shares, held for $KYTE), 50% to the ops Safe.

Keeper wallet: `0x377E8Ac104351173A1009Eb6bdCd9966174bBd4E` (the same key as Robinhood Chain), funded with HYPE.

## 2. Why RewardSink

$KYTE lives on Robinhood Chain. FeeVault.split needs a `stakingPool` that implements `notifyReward` and a
`buybackBurner`, so until the token is bridged both slots point at `RewardSink` (`contracts/src/RewardSink.sol`,
3 tests). It holds WHYPE, counts what FeeVault notified, and only the timelock can `withdraw(to, amount)`: to the
Robinhood Chain StakingPool once bridged, or to an Elysium StakingPool when $KYTE arrives. The keeper's buyback job
sees the sink in the burner slot and skips; the indexer treats the pool slot as absent (`/stake/<addr>` returns
404, `/stats` reports 0 staked).

## 3. How it was deployed

Everything from the Mac, in the Terminal app (Foundry keystores), driven by `scripts/mainnet/elysium.sh`:

1. **Gas.** 0.1 HYPE bought to the deployer landed on HyperEVM, not Elysium. Bridged with the canonical Inbox:
   `cast send 0xce59…2cff "depositEth()" --value 0.12ether --account deployer --rpc-url https://rpc.hyperliquid.xyz/evm`
   (arrives at the same address on Elysium in about 10 minutes). 0.04 HYPE sent on to the keeper.
2. **Safes** (`elysium.sh safes`, `CreateSafes.s.sol`): Elysium has Safe v1.3.0 at its canonical addresses, not
   v1.4.1, so the script now takes `SAFE_SINGLETON`, `SAFE_FACTORY`, `SAFE_FALLBACK` from env. The first run wrote
   simulated addresses because the salt used `block.timestamp`; the real proxies were read back from the
   `ProxyCreation` logs and the salt is now deterministic (owners + `SAFE_SALT`).
3. **Contracts** (`elysium.sh deploy`, `DeployElysium.s.sol`): timelock, registry, NFT, FeeVault, markets,
   RewardSink, Router. About 13.7M gas, 0.007 HYPE. Simulated against the RPC first.
4. **Wiring** (`elysium.sh plan` then `wire`): 11 timelock operations in one Safe transaction via MultiSendCallOnly,
   10 minute delay, executed: `setDestinations(sink, sink, ops)`, `setRouter` on both markets, `addAsset` and
   `setPutsEnabled` for the four tokens. The first attempt did nothing because `safe-run.mjs` used the v1.4.1
   MultiSendCallOnly address, which has no code on Elysium (a Safe delegatecall to an empty address reports
   success). `safe-run.mjs` now takes `MULTISEND`, checks it has code, and fails fast if nothing got queued.
5. **Sync** (`elysium.sh sync`): ABIs and addresses into `src/lib/generated`, committed and pushed.

Chain facts used: RPC `https://rpc.elysium.kinetiq.xyz`, explorer `https://elysium.kinetiq.xyz/explorer`, gas
0.5 gwei, Safe v1.3.0 (`GnosisSafeL2 0x3E5c…D36E`, factory `0xa6B7…6AB2`, fallback `0xf48f…5e4`,
`MultiSendCallOnly 0x40A2aCCbd92BCA938b02010E17A5b8929b49130D`).

## 4. What changed in the code

| Area | Change |
|---|---|
| `src/lib/chains.ts` | `elysium` (99901) and `elysiumTestnet` (99801) chain definitions (HYPE, explorer, Multicall3); `QUOTE_SYMBOL` (WETH/WHYPE), `GAS_SYMBOL`; `CHAIN_SITES` for the header toggle; Elysium WHYPE and PoolManager in the external address table |
| `src/components/ChainSwitch.tsx`, `Nav.tsx` | header toggle Robinhood / Elysium with logos (`public/brand/robinhood-mark.svg`, `public/brand/elysium-mark.png`); the other chain's site opens on the same path |
| Trading pages (`sell`, `market`, `positions`, `LiveOffers`, `BuyDialog`, `data.ts`) | "ETH" copy replaced by `GAS_SYMBOL` so Elysium shows HYPE |
| `indexer/src/index.mjs` | quote-asset USD price per chain (Coinbase/Kraken `HYPE-USD` on Elysium), DexScreener chain slug (`elysium`), Robinhood quote feed only on 4663, `POOL` null when the pool slot is a RewardSink (stats, stake routes, staker share), RPC defaults |
| `keeper/src/index.mjs` | buyback skipped when the burner slot is the RewardSink; RPC defaults |
| `contracts/` | `RewardSink.sol` + test, `DeployElysium.s.sol`, `CreateSafes.s.sol` env-configurable Safe addresses and deterministic salt, `foundry.toml` `elysium` / `elysium_testnet` endpoints |
| `scripts/mainnet/` | `elysium.sh`, `elysium.env.example`, `timelock-calldata.mjs` RPCs for 99901/99801, `safe-run.mjs` `MULTISEND` + guards |
| `render.yaml` | Elysium services documented (not declared: the account's 25-service limit made every sync fail) |

Still hardcoded: "ETH" on the docs page, landing, agent tools and FOBO components (about 100 lines). They are
Robinhood-only or informational; `GAS_SYMBOL` is the replacement when touched.

## 5. Hosting (Render, created through the API)

| Service | Id | What |
|---|---|---|
| `kyte-indexer-elysium` | srv-dbp9hj7f3r2c73fggoeg | private service, Docker, `CHAIN_ID=99901`, `RPC_URL`, `START_BLOCK=3712655`, `SITE_URL=https://elysium.kyte.sh`, disk `indexer-data-elysium`; internal `kyte-indexer-elysium:4200` |
| `kyte-web-elysium` | srv-dbp9id88v5cc73djv6fg | Next.js, `NEXT_PUBLIC_CHAIN_ID=99901`, `INDEXER_INTERNAL_HOSTPORT=kyte-indexer-elysium:4200`, Launchpad and Rewards off, custom domain `elysium.kyte.sh`; https://kyte-web-elysium.onrender.com |
| `kyte-keeper-elysium` | srv-dbp9ie942hec73c0cej0 | worker like kyte-keeper-v2, `CHAIN_ID=99901`, `RPC_URL`, `INDEXER_URL=http://kyte-indexer-elysium:4200`, key from `/etc/secrets/keeper.key` |

18 suspended, unrelated services were deleted on 10 Nov (with approval) to get under the Hobby limit of 25.
The Robinhood Chain services (`kyte-indexer`, `kyte-web`, `kyte-keeper-v2`) are untouched.

## 6. Operations

- **List a token**: `ASSETS="0xToken:cap:minStrike:1" CHAIN_ID=99901 RPC_URL=https://rpc.elysium.kinetiq.xyz node scripts/mainnet/timelock-calldata.mjs`
  then `scripts/mainnet/elysium.sh wire`. (The plan tool also re-emits setDestinations and setRouter; they are
  idempotent and the timelock rejects an identical already-executed operation, so remove them from the plan file
  first or accept the revert of those entries.)
- **Move the staker/buyback share**: timelock `RewardSink.withdraw(to, amount)` via a plan like
  `scripts/mainnet/usdg-rewards-window-plan.mjs` and `safe-run.mjs auto` with `MULTISEND=0x40A2…130D`.
- **Pause**: guardian Safe → `pause()` on a market or the registry's `setEnabled(token, false)`.
- **Gas**: keep deployer and keeper above 0.02 HYPE; bridge from HyperEVM via the Inbox (`depositEth()`).
- **Verification**: Sourcify has no entry for chain 99901 (checked 10 Nov); request chain support or ask Kinetiq
  which verifier their explorer accepts. `scripts/mainnet/verify.mjs` works once Sourcify lists the chain
  (`CHAIN_ID=99901`).
- **Bring $KYTE**: bridge via Wormhole, deploy StakingPool + BuybackBurner + KyteHook pool on Uniswap v4 (Deploy
  scripts already exist), then timelock `setDestinations(pool, burner, ops)` and `RewardSink.withdraw` to seed them.

## 7. Open

- Keeper secret file `keeper.key` on kyte-keeper-elysium (dashboard), Namecheap CNAME `elysium` →
  `kyte-web-elysium.onrender.com`, `AI_GATEWAY_API_KEY` on the Elysium site if the agent should answer there.
- Seed the first offers (KNTQ covered calls, HYPE cash-secured puts) so the market is not empty.
- Kinetiq outreach: ecosystem page, builder revenue share (25% of sequencer revenue), kHYPE listing once it has a
  WHYPE pool. Draft in `docs/ELYSIUM.md`.
- DefiLlama: add `elysium` to the TVL and fees adapters (WHYPE as the quote token).
- MCP tools: a `chain` argument so agents can read both markets from one server.
