# Contracts (Foundry)

The core of Kyte's options market on Robinhood Chain. Logic and security rules: `../../SPEC.md`.

```bash
pnpm install          # OpenZeppelin 5.6.1, forge-std 1.11, Uniswap v4-core 1.0.2 (no git submodules)
forge build           # our contracts pin solc 0.8.28, v4-core pins 0.8.26; forge picks per file
forge test            # 106 tests: unit + fuzz (1,000 runs) + invariants + real v4 pool swaps
FOUNDRY_PROFILE=ci forge test   # 10,000 fuzz runs, deeper invariants
```

## Contracts

| Contract | Role |
|---|---|
| `lib/Types.sol`, `Constants.sol`, `Errors.sol`, `Events.sol` | Shared position struct, hard bounds (§7.1), errors and events (§12) |
| `lib/Governed.sol` | Timelock (changes settings) + guardian (can only pause/disable). Unpause is timelock-only |
| `AssetRegistry` | Token whitelist, per-asset cap and min strike, puts on/off, `MAX_ASSETS = 25` |
| `OptionNFT` | ERC-721, one per filled option. Only the matching market can mint/burn its id range. On-chain SVG `tokenURI` |
| `OptionMarketBase` | Shared escrow + lifecycle: create (exact balance-delta check), buy, cancel, expire, `expireMany`, fee snapshot, caps, pause |
| `CallMarket` | Covered calls: seller escrows tokens; holder pays strike in WETH to exercise |
| `PutMarket` | Cash-secured puts: seller escrows strike in WETH; holder delivers tokens to exercise |
| `FeeVault` | Receives fees, `split()` once per epoch: 30% stakers / 20% buyback / 50% ops (stakers ≥ 20%, sum = 100%) |
| `StakingPool` | Stake $KYTE, earn WETH. New stake is active from the next epoch (no flash-staking). Reward-per-share accumulator + pending bucket + `undistributed` |
| `BuybackBurner` | Keeper-only `buyAndBurn` through a swap adapter, per-call cap, slippage bound vs last price, burns to `0x…dEaD` (or `burn()`), emits `Burned` |
| `adapters/UniswapV4Adapter` | Direct Uniswap v4 PoolManager swap (unlock → swap → settle/take); TWAP quote via KyteHook when hooked. solc 0.8.26 |
| `hooks/KyteHook` | Uniswap v4 hook: TWAP oracle (afterInitialize/afterSwap observations) + 10 bps WETH fee to the FeeVault (afterSwapReturnDelta). Mined address via `script/HookDeployer.sol` |
| `Router` | Pay in ETH: `buyWithETH`, `exerciseWithETH`, `buyPutWithETH`, `createPutOfferWithETH`. Wraps exactly what's needed, refunds the rest, never holds a balance |

Ids: `(tag << 248) | localId`, tag 1 = calls, tag 2 = puts.

**Safety properties**
- No function moves collateral anywhere except to its seller or the option holder. There's no sweep or rescue.
- Pause blocks only `createOffer` / `createPutOffer` / `buy` / `stake` / `buyAndBurn`. Cancel, exercise, expire, unstake, claim and `split` always work.
- Fees are snapshotted per position. `exercise` needs `now < expiry`, `expire` needs `now >= expiry`.
- `nonReentrant` (transient storage) on every state-changing entry point; terminal status is set before any transfer.
- Buybacks have two on-chain floors: the adapter quote (KyteHook 10 minute TWAP, checked in the same transaction) and the
  last executed price. A stolen keeper key can't sell the WETH into a sandwich, not even on the first buyback. The hooked
  adapter never falls back to spot.
- Newly activated stake is locked for the epoch it activates in, so stake-before-the-split-then-leave earns nothing extra.
  Pending stake can always be withdrawn.
- `Deploy.s.sol` on mainnet (4663) requires the guardian, ops, admin and timelock to be contracts (Safes), a timelock
  delay of at least 48 h, and refuses rehearsal mode.

## Tests (106)

- **Unit:** every function and every revert path (one test per custom error) across all contracts.
- **Fuzz:** fee conservation, exercise-xor-expire around expiry ±10 s, token decimals 0–24, FeeVault conservation, StakingPool solvency.
- **Invariant (handler, 128 runs × 64 calls, incl. Router ETH flows):** call/put collateral ledgers, status only moves forward, NFT exists iff Filled, Router never holds a balance.
- **Uniswap v4:** adapter swaps on a real `PoolManager` + pool with liquidity, both token orders, partial fill refund, reverts.
- **Adversarial:** fee-on-transfer token rejected, NFT transfer → new holder exercises, router can't act for non-holders.

## Deploy

**Local devnet** (anvil on :8547; whole protocol + real v4 pool + seeded offers):
```bash
pnpm devnet            # terminal 1 (from the repo root)
pnpm devnet:deploy     # deploys, writes deployments/31337.json, syncs ABIs into the website
```

**Testnet / mainnet** (owner roles must be multisigs; the deployer needs ETH):
```bash
GUARDIAN=<guardian safe> ADMIN_SAFE=<admin safe> WETH=<weth> KYTE_TOKEN=<token> KEEPER=<bot> OPS_SAFE=<ops safe> \
  forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --account <keystore> --verify
```
`ADMIN_SAFE` deploys a 48 h `TimelockController` run by that Safe (or pass `TIMELOCK=<existing>`). Writes `deployments/<chainId>.json`.
Then, as timelock proposals: `registry.addAsset` / `setPutsEnabled`, `feeVault.setDestinations`, `callMarket.setRouter`,
`putMarket.setRouter`, `buybackBurner.setAdapter` (a `UniswapV4Adapter` on the WETH/KYTE pool).
Mainnet WETH is `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`, PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951`. Testnet WETH is still to confirm.

## Lint notes (intentional)

`forge build` lint warnings that are by design: `_mint` instead of `_safeMint` (no receiver callbacks, SPEC §5),
strict balance equality (fee-on-transfer guard), `transferFrom` with `from` = msg.sender or the router,
`block.timestamp` comparisons (durations ≥ 1 h).
