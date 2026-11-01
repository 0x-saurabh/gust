#!/usr/bin/env bash
# One command for the whole mainnet launch: creates the 3 role Safes (if the config doesn't have real Safes yet),
# then deploys + verifies every contract, then the KYTE pool and buyback adapter.
# Signs with the Foundry keystore `deployer`: you type its password when forge asks (once per step).
#
#   cd /Volumes/my_files/newii/gust-website && scripts/mainnet/launch.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE=scripts/mainnet/.env
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }
set -a; . "$ENV_FILE"; set +a
FORGE=$HOME/.foundry/bin/forge
CAST=$HOME/.foundry/bin/cast
RPC=${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}
ACCOUNT=${ACCOUNT:-deployer}

is_contract() { # real deployed code, not empty and not a 23-byte EIP-7702 delegation
  local code; code=$($CAST code "$1" --rpc-url "$RPC" 2>/dev/null || echo "0x")
  [ ${#code} -gt 48 ]
}
set_env() { # set KEY=VALUE in the env file (replace or append)
  if grep -q "^$1=" "$ENV_FILE"; then sed -i '' -E "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}

echo "== 1/3 role Safes"
if [ -n "${ADMIN_SAFE:-}" ] && [ -n "${GUARDIAN:-}" ] && [ -n "${OPS_SAFE:-}" ]; then
  # Never create a second set: once the config has Safes, Deploy.s.sol verifies on chain that they are contracts.
  echo "Safes already in $ENV_FILE: admin $ADMIN_SAFE, guardian $GUARDIAN, ops $OPS_SAFE (skipping creation)"
else
  : "${SAFE_OWNERS:?set SAFE_OWNERS (comma separated owner wallets) in $ENV_FILE}"
  (cd contracts && $FORGE script script/CreateSafes.s.sol --rpc-url "$RPC" --account "$ACCOUNT" --broadcast --slow)
  F=contracts/deployments/safes-$($CAST chain-id --rpc-url "$RPC").json
  ADMIN_SAFE=$(node -e "console.log(require('./$F').admin)"); GUARDIAN=$(node -e "console.log(require('./$F').guardian)"); OPS_SAFE=$(node -e "console.log(require('./$F').ops)")
  set_env ADMIN_SAFE "$ADMIN_SAFE"; set_env GUARDIAN "$GUARDIAN"; set_env OPS_SAFE "$OPS_SAFE"
  echo "Safes created and saved to $ENV_FILE: admin $ADMIN_SAFE, guardian $GUARDIAN, ops $OPS_SAFE"
fi

CHAIN=$($CAST chain-id --rpc-url "$RPC")
DEP=contracts/deployments/$CHAIN.json
deployed() { # true when the deployment file exists and its CallMarket has code on chain
  [ -f "$DEP" ] || return 1
  local cm; cm=$(node -e "console.log(require('./$DEP').callMarket||'')"); [ -n "$cm" ] && is_contract "$cm"
}

echo "== 2/3 protocol contracts"
if deployed; then
  echo "already deployed (see $DEP): skipping. A second deploy would create a duplicate protocol."
else
  scripts/mainnet/deploy.sh core
fi

echo "== 3/3 KYTE pool + buyback adapter"
ADAPTER=$(node -e "const d=require('./$DEP');console.log(d.swapAdapter||'')")
if [ -n "$ADAPTER" ] && [ "$ADAPTER" != "0x0000000000000000000000000000000000000000" ] && is_contract "$ADAPTER"; then
  echo "adapter already deployed ($ADAPTER): skipping"
else
  scripts/mainnet/deploy.sh adapter
fi

echo "== verify (Sourcify, no key needed)"
node scripts/mainnet/verify.mjs || true

echo
echo "Deployed. Next: node scripts/mainnet/timelock-calldata.mjs  (Safe transactions that open the market once the timelock delay passes)"
