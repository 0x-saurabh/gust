#!/usr/bin/env bash
# ONE command: Markets v2 on Robinhood Chain mainnet, so every Robinhood Stock Token (AAPL, NVDA, TSLA, SPY, ...)
# can be traded beside the 25 v1 tokens. Re-run to resume from wherever it stopped; every step checks what is done.
#
#   cd /Volumes/my_files/newii/gust-website && scripts/mainnet/markets-v2.sh
#
#   1. deploys AssetRegistry (300 slots), OptionNFT, CallMarket, PutMarket, Router (DeployMarketsV2.s.sol), wired to
#      the live timelock, guardian and FeeVault. Asks for the deployer keystore password. Costs ~0.0004 ETH.
#   2. records the deploy block, syncs the website config, verifies the new contracts on Sourcify/Blockscout.
#   3. lists 228 tokens and sets the routers through the admin Safe + 10 min timelock, in 3 Safe transactions
#      (each: owner passwords + deployer password, schedule, wait out the delay, execute).
#   4. asks before committing the deployment file and pushing to main (Render then redeploys site, indexer, keeper).
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE=scripts/mainnet/.env
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
FORGE=${FORGE:-$HOME/.foundry/bin/forge}
ACCOUNT=${ACCOUNT:-deployer}
RPC=${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}
DEP=contracts/deployments/4663.json

for i in $(seq 1 20); do
  CID=$(~/.foundry/bin/cast chain-id --rpc-url "$RPC" 2>/dev/null) && break
  echo "  RPC not reachable yet (attempt $i/20), retrying in 3 s..."; sleep 3
done
[ "${CID:-}" = 4663 ] || { echo "RPC unreachable or not Robinhood Chain mainnet (got '${CID:-none}'): nothing was sent"; exit 1; }

echo "== 1/4 deploy markets v2"
if node -e "process.exit(require('./$DEP').v2 ? 0 : 1)"; then
  echo "   already deployed: $(node -p "JSON.stringify(require('./$DEP').v2)")"
else
  (cd contracts && "$FORGE" build -q && "$FORGE" test -q --no-match-contract Fork)
  (cd contracts && "$FORGE" script script/DeployMarketsV2.s.sol --rpc-url "$RPC" --account "$ACCOUNT" --broadcast --slow)
fi

echo "== 2/4 record, sync, verify"
node scripts/mainnet/v2-plan.mjs record
node scripts/sync-contracts.mjs
node scripts/export-service-abis.mjs >/dev/null
node scripts/mainnet/verify.mjs || echo "   (verification can be re-run later: node scripts/mainnet/verify.mjs)"

echo "== 3/4 timelock: routers + listings"
mkdir -p scripts/mainnet/out
PLANS=$(node scripts/mainnet/v2-plan.mjs plan | grep '^scripts/mainnet/out/v2-plan-')
n=0; total=$(echo "$PLANS" | wc -l | tr -d ' ')
for P in $PLANS; do
  n=$((n + 1))
  echo "-- Safe transaction $n/$total: $P"
  PLAN_FILE="$P" RAW_FILE="${P%.json}.raw.json" caffeinate -i node scripts/mainnet/safe-run.mjs auto
done
REG=$(node -p "require('./$DEP').v2.assetRegistry")
echo "   v2 registry lists $(~/.foundry/bin/cast call "$REG" 'assetCount()(uint256)' --rpc-url "$RPC") tokens"

echo "== 4/4 publish"
git --no-pager diff --stat -- "$DEP" src/lib/generated indexer/abis
read -r -p "Commit the v2 addresses and push to main (Render redeploys the site, indexer and keeper)? [y/N] " ok
if [ "$ok" = y ] || [ "$ok" = Y ]; then
  git add "$DEP" src/lib/generated/deployments.json indexer/abis
  git commit -m "Markets v2 live: Robinhood Stock Tokens listed" && git push origin HEAD:main
  echo "pushed. The site switches to v2 when Render finishes; v1 positions keep settling in v1."
else
  echo "not pushed. When ready: git add $DEP src/lib/generated/deployments.json indexer/abis && git commit && git push"
fi
