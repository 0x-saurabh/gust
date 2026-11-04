#!/usr/bin/env bash
# Lists the trending crypto tokens in scripts/mainnet/v2-extra-tokens.json in the v2 registry: one more Safe
# transaction through the 10 min timelock (owner passwords + deployer password). Run it AFTER markets-v2.sh has
# finished; it refuses while any markets-v2 operation is still pending. Re-run to resume.
#
#   cd /Volumes/my_files/newii/gust-website && scripts/mainnet/list-trending.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=scripts/mainnet/out
CACHE=$OUT/v2-plans-4663.json
EXTRA_CACHE=$OUT/v2-trending-plans-4663.json

if [ -f "$CACHE" ]; then
  for P in $OUT/v2-plan-[0-9]-4663.json; do
    [ -f "$P" ] || continue
    if PLAN_FILE="$P" node scripts/mainnet/safe-run.mjs status | grep -vq '^done'; then
      echo "markets-v2 is not finished ($P still has pending operations). Finish scripts/mainnet/markets-v2.sh first."; exit 1
    fi
  done
  mv "$CACHE" "$OUT/v2-plans-4663.launch.json" # the launch plan is done: keep it for the record
fi
# With everything from the launch listed, a fresh plan contains only the trending tokens (and anything new).
[ -f "$EXTRA_CACHE" ] && cp "$EXTRA_CACHE" "$CACHE"
PLANS=$(OUT_DIR=$OUT node scripts/mainnet/v2-plan.mjs plan | grep "^$OUT/v2-plan-")
cp "$CACHE" "$EXTRA_CACHE"
for P in $PLANS; do
  T="${P%-4663.json}-trending-4663.json"
  mv "$P" "$T"
  echo "-- $T"
  PLAN_FILE="$T" RAW_FILE="${T%.json}.raw.json" caffeinate -i node scripts/mainnet/safe-run.mjs auto
done
rm -f "$CACHE"
REG=$(node -p "require('./contracts/deployments/4663.json').v2.assetRegistry")
echo "v2 registry lists $(~/.foundry/bin/cast call "$REG" 'assetCount()(uint256)' --rpc-url "${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}") tokens"
