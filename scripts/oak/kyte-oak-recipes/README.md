# Kyte recipes for Oak Agent Kit

[Kyte](https://kyte.sh) is the on-chain options market on Robinhood Chain (chain id 4663): fully collateralised
covered calls and cash-secured puts on listed tokens, paid in ETH, settled by the contracts. This package gives an
[Oak Agent Kit](https://github.com/OakAgentKit/oak) agent those markets as declarative `oak-recipe/v1` recipes.
It is data only: 23 JSON files, no code.

```bash
oak recipes add kyte-oak-recipes
```

Recipes are imported as-is, not reviewed by Oak. Oak installs them under `~/.oak/recipes/kyte/`.

## Recipes

| Recipe | Contract | What it does |
|---|---|---|
| `get-call`, `get-put` | CallMarket, PutMarket | Read an option: seller, token, amount, strike, premium, expiry, status |
| `get-asset`, `listed-token`, `asset-count` | AssetRegistry | Which tokens are listed, puts enabled, cap, minimum strike |
| `staking-balances`, `staking-rewards` | StakingPool | Staked $KYTE and claimable WETH |
| `buy-call`, `buy-put` | Router | Buy an open offer with ETH (value = maxPremium, excess refunded) |
| `sell-covered-call` | CallMarket | Lock tokens, list a call (approve the CallMarket first) |
| `sell-covered-call-pons`, `sell-covered-call-kyte` | CallMarket | Same, with the token approval handled |
| `sell-cash-secured-put` | Router | Lock the strike in ETH, list a put (value = strike) |
| `exercise-call`, `exercise-put` | CallMarket, PutMarket | Settle a filled option you hold before expiry |
| `cancel-call`, `cancel-put` | CallMarket, PutMarket | Cancel your unfilled offer, collateral back |
| `expire-call`, `expire-put` | CallMarket, PutMarket | After expiry, collateral back to the seller |
| `stake`, `unstake`, `claim-rewards` | StakingPool | $KYTE staking, approval handled |
| `unwrap-weth` | WETH | WETH to ETH (premiums, strikes and rewards arrive as WETH) |

Amounts are base-unit strings. `strike` and `premium` are wei of ETH for the whole `amount`, not per token.
Expiry is 1 hour to 90 days (24 hours for Pons launchpad tokens). Fees: 3% of the premium when filled,
0.1% of the strike on exercise, both snapshotted per position.

## Contracts (Robinhood Chain, current markets v3)

| | |
|---|---|
| CallMarket | `0xb6759D8893601BB7c1A032eC8ea40C856a6adf80` |
| PutMarket | `0x2E2d5DfB4cf30d15688Cc2DDD30641c78DFfcb35` |
| Router | `0xdD76956667E6423bAC56d2EbF827a9b0d7dBDF68` |
| AssetRegistry | `0x02f571e10B9c7303EB7A6284A7137b146e18658D` |
| StakingPool | `0xD7253a90fd43507F44cF0934F3D5d7432760d17f` |
| KYTE | `0x072D88c2F31F568C0F4B8F613692eB489541Ed45` |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

Positions opened on the older v1 and v2 markets settle through those contracts; use [kyte.sh/positions](https://kyte.sh/positions)
or the Kyte MCP server for them. Source and verification: https://kyte.sh/docs. Discovery, previews and
validation of offers without a wallet: the Kyte MCP server at `https://kyte.sh/api/mcp` (20 tools, no login).

Options can expire worthless. This is software, not financial advice. Kyte is not affiliated with Robinhood or Oak.
