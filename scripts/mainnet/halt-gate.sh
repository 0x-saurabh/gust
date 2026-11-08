#!/usr/bin/env bash
# Deploys KyteHaltGate (Kyte's reader of Harmonic Agent's session oracle) on Robinhood Chain, records it in
# contracts/deployments/4663.json as `harmonicHaltGate`, verifies the source on Sourcify, and reads it back.
# One deployer keystore password. docs/HARMONIC.md, phase 3.
#
#   cd /Volumes/my_files/newii/gust-website && scripts/mainnet/halt-gate.sh
#
# The gate answers Unreadable until its seat on the oracle is paid (100 USDG a month, from any wallet):
#   approve USDG (0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168) to the oracle for 100e6 * months, then
#   cast send 0x938097252667b9efac600c8dd1826f54eae96881 "subscribe(address,uint256)" <gate> <months> --account deployer
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.foundry/bin:$PATH"
DEP=contracts/deployments/4663.json
RPC=${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}
j() { node -e "console.log(require('./$DEP')$1 || '')"; }
NVDA=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC
if [ -z "$(j .harmonicHaltGate)" ]; then
  echo "== 1/3 deploy KyteHaltGate (deployer keystore password)"
  OUTL=$(cd contracts && forge script script/DeployKyteHaltGate.s.sol --rpc-url "$RPC" --account "${ACCOUNT:-deployer}" --broadcast --slow 2>&1 | tee /dev/stderr)
  ADDR=$(echo "$OUTL" | grep -o "KyteHaltGate 0x[0-9a-fA-F]\{40\}" | awk '{print $2}' | tail -1)
  [ -n "$ADDR" ] || { echo "deploy failed"; exit 1; }
  node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('$DEP'));d.harmonicHaltGate='$ADDR';fs.writeFileSync('$DEP',JSON.stringify(d,null,2)+'\n')"
  echo "recorded harmonicHaltGate=$ADDR in $DEP"
else
  echo "== 1/3 already deployed: $(j .harmonicHaltGate)"
fi
GATE=$(j .harmonicHaltGate)
echo "== 2/3 verify source on Sourcify"
node scripts/mainnet/verify.mjs 2>&1 | grep -E "harmonicHaltGate|verified" || true
echo "== 3/3 read back"
echo "oracle:      $(cast call "$GATE" 'haltOracle()(address)' --rpc-url "$RPC")"
echo "maxAge:      $(cast call "$GATE" 'haltMaxAge()(uint64)' --rpc-url "$RPC") s"
echo "seat paid:   $(cast call "$GATE" 'gateSubscribed()(bool,uint64)' --rpc-url "$RPC" | tr '\n' ' ')"
echo "NVDA gate:   $(cast call "$GATE" 'gateVerdict(address)(uint8,uint8,uint64)' $NVDA --rpc-url "$RPC" | tr '\n' ' ')  (gate 0 Open, 1 NotOpen, 2 Quiet, 3 Unreadable; Unreadable until the seat is paid)"
echo "done. Commit $DEP and push."
