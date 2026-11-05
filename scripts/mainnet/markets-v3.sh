#!/usr/bin/env bash
# ONE command: Markets v3 on Robinhood Chain mainnet: the new Option NFT with readable art (token amounts, ETH
# prices, UTC expiry) for every listed stock token and crypto token. Re-run to resume; every step checks what is done.
#
#   cd /Volumes/my_files/newii/gust-website && scripts/mainnet/markets-v3.sh
#
#   1. deploys OptionNFT, CallMarket, PutMarket, Router (DeployMarketsV3.s.sol), reusing the v2 AssetRegistry (all
#      228 listings carry over) and the live timelock, guardian, FeeVault and v2 fees. Asks for the deployer keystore
#      password. Costs ~0.0004 ETH.
#   2. records the deploy block, syncs the website config, verifies the new contracts on Sourcify/Blockscout.
#   3. sets the routers through the admin Safe + 10 min timelock: ONE Safe transaction (owner passwords + deployer
#      password, schedule, wait out the delay, execute).
#   4. commits the deployment file and pushes to main (Render redeploys site, indexer, keeper). New offers then go to
#      v3; v1 and v2 positions keep settling where they are.
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

echo "== 1/4 deploy markets v3"
if node -e "process.exit(require('./$DEP').v3 ? 0 : 1)"; then
  echo "   already deployed: $(node -p "JSON.stringify(require('./$DEP').v3)")"
else
  (cd contracts && "$FORGE" build -q && "$FORGE" test -q --no-match-contract Fork)
  (cd contracts && "$FORGE" script script/DeployMarketsV3.s.sol --rpc-url "$RPC" --account "$ACCOUNT" --broadcast --slow)
fi

echo "== 2/4 record, sync, verify"
node scripts/mainnet/v3-plan.mjs record
node scripts/sync-contracts.mjs
node scripts/export-service-abis.mjs >/dev/null
node scripts/mainnet/verify.mjs || echo "   (verification can be re-run later: node scripts/mainnet/verify.mjs)"

echo "== 3/4 timelock: routers"
mkdir -p scripts/mainnet/out
P=$(node scripts/mainnet/v3-plan.mjs plan | grep '^scripts/mainnet/out/v3-plan-' || true)
if [ -n "$P" ]; then
  echo "-- Safe transaction: $P"
  PLAN_FILE="$P" RAW_FILE="${P%.json}.raw.json" caffeinate -i node scripts/mainnet/safe-run.mjs auto
fi
for m in callMarket putMarket; do
  A=$(node -p "require('./$DEP').v3.$m"); R=$(node -p "require('./$DEP').v3.router")
  GOT=$(~/.foundry/bin/cast call "$A" 'router()(address)' --rpc-url "$RPC")
  [ "$(echo "$GOT" | tr A-F a-f)" = "$(echo "$R" | tr A-F a-f)" ] || { echo "   $m router is $GOT, expected $R: re-run this script"; exit 1; }
done
echo "   routers set"

echo "== 4/4 publish"
git --no-pager diff --stat -- "$DEP" src/lib/generated indexer/abis
git add "$DEP" src/lib/generated/deployments.json indexer/abis
git commit -m "Markets v3 live: readable Option NFT art for every listed token" && git push origin HEAD:main
echo "pushed. The site switches new offers to v3 when Render finishes; v1 and v2 positions keep settling."
