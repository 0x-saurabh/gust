#!/usr/bin/env bash
# Deploys FoboLister and wires it up. Two steps, each needing the deployer keystore password once:
#   1. forge script deploys the lister (deployer pays gas) and records it in contracts/deployments/4663.json
#   2. one Safe transaction through the 10 min timelock grants the lister proposer + executor on the timelock
# From then on the keeper lists every FOBO token whose floor backs 4.2 ETH after 24 h, with no signatures from anyone.
#
#   cd /Volumes/my_files/newii/gust-website && scripts/mainnet/fobo-lister.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.foundry/bin:$PATH"
DEP=contracts/deployments/4663.json
j() { node -e "console.log(require('./$DEP')$1 || '')"; }
export TIMELOCK=$(j .timelock) GUARDIAN=$(j .guardian) REGISTRY=$(j .v3.assetRegistry)
export FOBO_HOOK=0x0Af57F62982D03066ef917AcAd87F771c06528Ec
export CAP_BPS="${CAP_BPS:-200}" MIN_STRIKE="${MIN_STRIKE:-1000000000000}" MIN_AGE="${MIN_AGE:-86400}" MIN_FLOOR_ETH_WEI="${MIN_FLOOR_ETH_WEI:-4200000000000000000}" PUTS_ON="${PUTS_ON:-true}"
if [ -z "$(j .foboLister)" ]; then
  echo "== 1/2 deploy FoboLister (deployer keystore password)"
  OUTL=$(cd contracts && forge script script/DeployFoboLister.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --account "${ACCOUNT:-deployer}" --broadcast --slow 2>&1 | tee /dev/stderr)
  ADDR=$(echo "$OUTL" | grep -o "FoboLister 0x[0-9a-fA-F]\{40\}" | awk '{print $2}' | tail -1)
  [ -n "$ADDR" ] || { echo "deploy failed"; exit 1; }
  node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('$DEP'));d.foboLister='$ADDR';fs.writeFileSync('$DEP',JSON.stringify(d,null,2)+'\n')"
  echo "recorded foboLister=$ADDR in $DEP"
fi
echo "== 2/2 timelock roles (Safe owners + deployer passwords)"
P=$(node scripts/mainnet/fobo-lister-roles-plan.mjs | tee /dev/stderr | grep '^scripts/mainnet/out/fobo-lister-roles-plan-' || true)
[ -n "$P" ] || { echo "roles already granted or plan failed"; exit 0; }
PLAN_FILE="$P" RAW_FILE="${P%.json}.raw.json" caffeinate -i node scripts/mainnet/safe-run.mjs auto
echo "done. Commit contracts/deployments/4663.json and push: the keeper (Render kyte-keeper-v2) lists qualifying FOBO tokens from its next tick."
