#!/usr/bin/env bash
# Deploys PonsLister and wires it up. Two steps, each needing the deployer keystore password once:
#   1. forge script deploys the lister (deployer pays gas) and records it in contracts/deployments/4663.json
#   2. one Safe transaction through the 10 min timelock grants the lister proposer + executor on the timelock
# From then on the keeper lists every graduated Pons token with no signatures from anyone.
#
#   cd /Volumes/my_files/newii/gust-website && scripts/mainnet/pons-lister.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.foundry/bin:$PATH"
DEP=contracts/deployments/4663.json
j() { node -e "console.log(require('./$DEP')$1 || '')"; }
export TIMELOCK=$(j .timelock) GUARDIAN=$(j .guardian) WETH=$(j .weth) REGISTRY=$(j .v3.assetRegistry)
export PONS_FACTORY=0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB PONS_LEGACY_FACTORY=0x0c37a24F5D23A486FA692d1500881d698B1F77a4
export PONS_LOCKER=0x736D76699C26D0d966744cAe304C000d471f7F35 PONS_LEGACY_LOCKER=0x31ca5E101941A93A7DD6d0497928700625CF54B5
export CAP_BPS="${CAP_BPS:-200}" MIN_STRIKE="${MIN_STRIKE:-1000000000000}"
if [ -z "$(j .ponsLister)" ]; then
  echo "== 1/2 deploy PonsLister (deployer keystore password)"
  OUTL=$(cd contracts && forge script script/DeployPonsLister.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --account "${ACCOUNT:-deployer}" --broadcast --slow 2>&1 | tee /dev/stderr)
  ADDR=$(echo "$OUTL" | grep -o "PonsLister 0x[0-9a-fA-F]\{40\}" | awk '{print $2}' | tail -1)
  [ -n "$ADDR" ] || { echo "deploy failed"; exit 1; }
  node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('$DEP'));d.ponsLister='$ADDR';fs.writeFileSync('$DEP',JSON.stringify(d,null,2)+'\n')"
  echo "recorded ponsLister=$ADDR in $DEP"
fi
echo "== 2/2 timelock roles (Safe owners + deployer passwords)"
P=$(node scripts/mainnet/pons-lister-roles-plan.mjs | tee /dev/stderr | grep '^scripts/mainnet/out/pons-lister-roles-plan-' || true)
[ -n "$P" ] || { echo "roles already granted or plan failed"; exit 0; }
PLAN_FILE="$P" RAW_FILE="${P%.json}.raw.json" caffeinate -i node scripts/mainnet/safe-run.mjs auto
echo "done. Commit contracts/deployments/4663.json and push: the keeper (Render kyte-keeper-v2) lists graduated tokens from its next tick."
