# $KYTE launch on Robinhood Chain mainnet

Status as of 6 November 2026, 14:45 IST: **complete on chain and pushed**. The launch script
(`scripts/mainnet/kyte-token.sh`) deployed the new contracts, executed the timelock operations at 14:40, synced the
website config and pushed commit `d223c25` to main. Render is redeploying the site, indexer and keeper from it.

## The token

| | |
|---|---|
| Name / symbol | Kyte / KYTE |
| Address | `0x072D88c2F31F568C0F4B8F613692eB489541Ed45` |
| Decimals | 18 |
| Total supply | 1,000,000,000 KYTE |
| Chain | Robinhood Chain mainnet (chain id 4663) |
| Explorer | https://robinhoodchain.blockscout.com/address/0x072D88c2F31F568C0F4B8F613692eB489541Ed45 |

## Done: new contracts deployed (step 1 to 3 of the launch)

All three deployed from the `deployer` keystore and recorded in `contracts/deployments/4663.json`.

| Contract | Address | Bound to the new token |
|---|---|---|
| StakingPool | `0xD7253a90fd43507F44cF0934F3D5d7432760d17f` | yes, `stakeToken()` returns `0x072D…Ed45` (verified on chain) |
| BuybackBurner | `0x8A9d128247D8c4512411CF9D0CdCAc5Acf86FB95` | yes, `token()` is the new $KYTE |
| Uniswap v4 swap adapter | `0xFa17818515E946180b9767f9D9c40A09EE80dda6` | swaps WETH to the new $KYTE on the KYTE/WETH pool for the burner |

The KYTE/WETH Uniswap v4 pool is initialised at 1,000,000 KYTE per ETH (opening price). It has no liquidity yet.

## Done: one timelock Safe transaction (step 4)

Scheduled through the admin Safe into the TimelockController `0xf8E6fAF7e0E57bc91aD5C59B84FedE2Cab842893`,
minimum delay 600 seconds. Queued at 14:30:49, executed after 14:40:49. All three operations report `done`.

| Operation | Effect |
|---|---|
| `FeeVault.setDestinations(newStakingPool, newBuybackBurner, opsSafe)` | 30% of every protocol fee goes to stakers of the new $KYTE, 20% to the new burner, 50% to ops |
| `BuybackBurner.setAdapter(newSwapAdapter)` | the burner buys the new $KYTE on Uniswap v4 and burns it |
| `AssetRegistry.addAsset(KYTE, cap 10,000,000, minStrike 0.0001 ETH)` | $KYTE options can be sold and bought on Market and Sell |

Verified on chain afterwards: `FeeVault.stakingPool()` is the new pool, `FeeVault.buybackBurner()` the new burner, and
`isEnabled(KYTE)` is true on the markets' registry `0x02f571e10B9c7303EB7A6284A7137b146e18658D` (the v2/v3 registry
the live Market reads; the v1 registry `0xcD07…5235` is not used for listings any more).

## Done: website, indexer, keeper (step 5)

The script ran `sync-contracts`, verified every contract on Sourcify (Blockscout shows the sources), committed the
deployment file and the generated site config, and pushed `d223c25` to `main`. Render redeploys `kyte-web`,
`kyte-indexer` and `kyte-keeper-v2` from it (5 to 8 minutes). The local launchd indexer at `~/.kyte/app` is
refreshed by re-running the script, which skips every finished step.

What users see once Render finishes:

- **Stake page**: approves and stakes the new $KYTE into `0xD725…d17f`; balances, epochs and claims read from the new pool.
- **Market and Sell**: KYTE appears in the token list with the Kyte logo (matched by address), tradeable with the cap and minimum strike above.
- **Proof page and footer**: fee splits and burns from the new burner show as they happen.

## Kept for the record: the test token set (`legacyKyte`)

| | Address |
|---|---|
| Test token (symbol TI) | `0x3849DcF9FA77EC5c21D57d841a268E77830800aF` |
| Old StakingPool | `0x4eD46d734e3Ddd9BF21364B9DfFBb2Ee030CEf8b` |
| Old BuybackBurner | `0xAF341cFdaEB96c18784ba60b2fdd51A7153E42d9` |
| Old swap adapter | `0x9376B2091e50A17ac14fc8dA2DE7e2368B3b0fa9` |

The old pool keeps working: anyone who staked the test token can still unstake and claim there. The website no
longer links to it.

## Unchanged protocol contracts

| Contract | Address |
|---|---|
| FeeVault | `0x78c569A1137B78cB78F42c42B4B6C2b8F1E3dDef` |
| AssetRegistry (v2/v3, used by the live markets) | `0x02f571e10B9c7303EB7A6284A7137b146e18658D` |
| AssetRegistry (v1, legacy) | `0xcD076486FBd192e2E942dA9DB2B78817DF0d5235` |
| TimelockController (admin) | `0xf8E6fAF7e0E57bc91aD5C59B84FedE2Cab842893` |
| Guardian Safe | `0x9F433eE8020cFb3521bDaE0DDA612932e1E90EF0` |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

## Tooling added for this launch

- `scripts/mainnet/kyte-token.sh 0xToken`: one-argument launch. Preflight on chain (contract, 18 decimals, supply),
  records the address in `scripts/mainnet/.env`, runs `kyte-launch.sh`, then verifies on chain that
  `StakingPool.stakeToken`, `BuybackBurner.token`, `FeeVault.stakingPool`, `FeeVault.buybackBurner`,
  `AssetRegistry.isEnabled` and the site config all point at the new token. Stops with a hint on any mismatch and
  resumes on re-run.
- `TokenLogo` shows the Kyte mark for whatever address is the protocol token, so the new $KYTE has its logo on day one.

## Remaining

1. Add KYTE/WETH liquidity to the Uniswap v4 pool from the treasury wallet. The Market chart, the buyback and the
   stakers' WETH share start with the first swap.
2. Announce: the token address above, `kyte.sh/stake`, and the fee split (30% stakers in WETH, 20% buyback and burn,
   50% operations). Options can expire worthless; Kyte is not affiliated with or endorsed by Robinhood.
