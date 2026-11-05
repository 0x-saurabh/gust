#!/usr/bin/env bash
# ONE command: $KYTE launch on Robinhood Chain mainnet. Re-run to resume; every step checks what is done.
#
#   cd /Volumes/my_files/newii/gust-website && KYTE_TOKEN=0x... KYTE_PER_ETH=... scripts/mainnet/kyte-launch.sh
#
#   KYTE_TOKEN    the live $KYTE contract (18 decimals, minted)
#   KYTE_PER_ETH  opening pool price, raw units (1,000,000 KYTE per ETH = 1000000000000000000000000)
#   optional: KYTE_CAP / KYTE_MIN_STRIKE (raw; default: the test token's listing), KYTE_PUTS=1, MAX_PER_CALL,
#             MAX_SLIPPAGE_BPS, POOL_FEE, TICK_SPACING
#
#   1. deploys StakingPool + BuybackBurner for the new token (DeployKyteLaunch.s.sol). Deployer password asked.
#   2. promotes them in the deployment file (the test-token set is kept under `legacyKyte`).
#   3. initialises the KYTE/WETH Uniswap v4 pool at KYTE_PER_ETH and deploys its swap adapter (DeployAdapter.s.sol).
#   4. timelock, ONE Safe transaction: feeVault.setDestinations, burner.setAdapter + setBounds, registry.addAsset.
#   5. syncs the website config, verifies the contracts, commits and pushes to main (Render redeploys site, indexer,
#      keeper). Then add liquidity to the pool from the treasury wallet; the chart and buyback start with the first swap.
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE=scripts/mainnet/.env
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
FORGE=${FORGE:-$HOME/.foundry/bin/forge}
CAST=${CAST:-$HOME/.foundry/bin/cast}
ACCOUNT=${ACCOUNT:-deployer}
RPC=${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}
DEP=contracts/deployments/4663.json
: "${KYTE_TOKEN:?set KYTE_TOKEN (the live token address)}"
: "${KYTE_PER_ETH:?set KYTE_PER_ETH (opening pool price, raw units)}"
export POOL_MANAGER=${POOL_MANAGER:-$(node -p "require('./$DEP').uniswapV4PoolManager")}
export KYTE_TOKEN KYTE_PER_ETH

for i in $(seq 1 20); do
  CID=$($CAST chain-id --rpc-url "$RPC" 2>/dev/null) && break
  echo "  RPC not reachable yet (attempt $i/20), retrying in 3 s..."; sleep 3
done
[ "${CID:-}" = 4663 ] || { echo "RPC unreachable or not Robinhood Chain mainnet (got '${CID:-none}'): nothing was sent"; exit 1; }
lc() { echo "$1" | tr A-F a-f; }
[ "$($CAST call "$KYTE_TOKEN" 'decimals()(uint8)' --rpc-url "$RPC")" = 18 ] || { echo "KYTE_TOKEN is not an 18-decimal token"; exit 1; }
echo "token: $KYTE_TOKEN $($CAST call "$KYTE_TOKEN" 'symbol()(string)' --rpc-url "$RPC") supply $($CAST call "$KYTE_TOKEN" 'totalSupply()(uint256)' --rpc-url "$RPC" | awk '{print $1/1e18}')"

echo "== 1/5 deploy StakingPool + BuybackBurner"
if [ "$(lc "$(node -p "require('./$DEP').launch?.kyteToken || ''")")" = "$(lc "$KYTE_TOKEN")" ]; then
  echo "   already deployed: $(node -p "JSON.stringify(require('./$DEP').launch)")"
else
  (cd contracts && "$FORGE" build -q && "$FORGE" test -q --no-match-contract Fork)
  (cd contracts && "$FORGE" script script/DeployKyteLaunch.s.sol --rpc-url "$RPC" --account "$ACCOUNT" --broadcast --slow)
fi

echo "== 2/5 deployment file"
node scripts/mainnet/kyte-launch-plan.mjs apply

echo "== 3/5 KYTE/WETH pool + swap adapter"
if [ -n "$(node -p "require('./$DEP').swapAdapter || ''")" ]; then
  echo "   adapter already deployed: $(node -p "require('./$DEP').swapAdapter")"
else
  (cd contracts && "$FORGE" script script/DeployAdapter.s.sol --rpc-url "$RPC" --account "$ACCOUNT" --broadcast --slow)
fi

echo "== 4/5 timelock: fee destinations, burner adapter, listing"
mkdir -p scripts/mainnet/out
P=$(node scripts/mainnet/kyte-launch-plan.mjs plan | grep '^scripts/mainnet/out/kyte-launch-plan-' || true)
if [ -n "$P" ]; then
  echo "-- Safe transaction: $P"
  PLAN_FILE="$P" RAW_FILE="${P%.json}.raw.json" caffeinate -i node scripts/mainnet/safe-run.mjs auto
fi
POOL=$(node -p "require('./$DEP').stakingPool"); GOT=$($CAST call "$(node -p "require('./$DEP').feeVault")" 'stakingPool()(address)' --rpc-url "$RPC")
[ "$(lc "$GOT")" = "$(lc "$POOL")" ] || { echo "   feeVault.stakingPool is $GOT, expected $POOL: re-run this script"; exit 1; }
echo "   fees now flow to the new pool and burner"

echo "== 5/5 publish"
node scripts/sync-contracts.mjs
node scripts/export-service-abis.mjs >/dev/null
node scripts/mainnet/verify.mjs || echo "   (verification can be re-run later: node scripts/mainnet/verify.mjs)"
git --no-pager diff --stat -- "$DEP" src/lib/generated indexer/abis
git add "$DEP" src/lib/generated/deployments.json indexer/abis
git commit -q -m "Launch: live \$KYTE token, new StakingPool and BuybackBurner, KYTE/WETH pool" || echo "   nothing to commit"
git push origin main
echo "done. Next: add KYTE/WETH liquidity from the treasury wallet, then sync ~/.kyte/app and kickstart the local indexer."
