#!/usr/bin/env bash
# Deploys UsdgRewards (docs/USDG_REWARDS.md). One step, the deployer keystore password once. No Safe transaction:
# the publisher (keeper) is set in the constructor; the ops Safe funds the contract by transferring USDG to it.
#
#   cd /Volumes/my_files/newii/gust-website && scripts/mainnet/usdg-rewards.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.foundry/bin:$PATH"
DEP=contracts/deployments/4663.json
j() { node -e "console.log(require('./$DEP')$1 || '')"; }
export TIMELOCK=$(j .timelock) GUARDIAN=$(j .guardian)
export USDG="${USDG:-0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168}"
# The live keeper wallet (Render kyte-keeper-v2), not deployments.keeper (the deploy-time key, unused).
export PUBLISHER="${PUBLISHER:-0x377E8Ac104351173A1009Eb6bdCd9966174bBd4E}"
export CLAIM_WINDOW="${CLAIM_WINDOW:-7776000}"
[ -n "$PUBLISHER" ] || { echo "PUBLISHER (the keeper wallet) is required"; exit 1; }
if [ -n "$(j .usdgRewards)" ]; then echo "usdgRewards already deployed at $(j .usdgRewards)"; exit 0; fi
echo "== deploy UsdgRewards (publisher $PUBLISHER, window ${CLAIM_WINDOW}s)"
OUTL=$(cd contracts && forge script script/DeployUsdgRewards.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --account "${ACCOUNT:-deployer}" --broadcast --slow 2>&1 | tee /dev/stderr)
ADDR=$(echo "$OUTL" | grep -o "UsdgRewards 0x[0-9a-fA-F]\{40\}" | awk '{print $2}' | tail -1)
[ -n "$ADDR" ] || { echo "deploy failed"; exit 1; }
node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('$DEP'));d.usdgRewards='$ADDR';fs.writeFileSync('$DEP',JSON.stringify(d,null,2)+'\n')"
node scripts/sync-contracts.mjs
echo "recorded usdgRewards=$ADDR. Next: commit + push; set REWARDS_POOL_USDG on the Render indexer; ops Safe sends USDG to $ADDR."
