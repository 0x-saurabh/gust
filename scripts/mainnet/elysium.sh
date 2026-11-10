#!/usr/bin/env bash
# Kyte on Elysium mainnet (chain 99901), docs/ELYSIUM.md. Run each step in the Terminal app (keystore passwords).
#
#   cp scripts/mainnet/elysium.env.example scripts/mainnet/elysium.env     # once
#   scripts/mainnet/elysium.sh safes      # 1. admin, guardian and ops Safes (Safe v1.3.0 on Elysium); writes them into elysium.env
#   scripts/mainnet/elysium.sh deploy     # 2. DeployElysium.s.sol: timelock, registry, NFT, FeeVault, markets, Router, RewardSink
#   scripts/mainnet/elysium.sh plan       # 3. timelock wiring (destinations, routers, first listings) as a Safe plan
#   scripts/mainnet/elysium.sh wire       # 4. schedule + execute the plan from the admin Safe (10 min delay)
#   scripts/mainnet/elysium.sh sync       # 5. ABIs + addresses into the site; then commit and push
#
# The deployer keystore wallet needs HYPE on Elysium (bridge from HyperEVM, https://elysium.kinetiq.xyz/bridge).
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE=scripts/mainnet/elysium.env
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy scripts/mainnet/elysium.env.example)"; exit 1; }
grep -q -i -E "PRIVATE_KEY|=0x[0-9a-fA-F]{64}" "$ENV_FILE" && { echo "refusing: $ENV_FILE contains a private key; use the keystore"; exit 1; }
set -a; . "$ENV_FILE"; set +a
export PATH="$HOME/.foundry/bin:$PATH"
ACCOUNT=${ACCOUNT:-deployer}
RPC=${RPC_URL:-https://rpc.elysium.kinetiq.xyz}
CID=$(cast chain-id --rpc-url "$RPC")
[ "$CID" = "${CHAIN_ID:-99901}" ] || { echo "RPC is chain $CID, expected ${CHAIN_ID:-99901}"; exit 1; }
STEP=${1:-}
case "$STEP" in
  safes)
    [ -z "${ADMIN_SAFE:-}" ] || { echo "ADMIN_SAFE already set in $ENV_FILE: $ADMIN_SAFE (remove it to create new Safes)"; exit 0; }
    (cd contracts && forge script script/CreateSafes.s.sol --rpc-url "$RPC" --account "$ACCOUNT" --broadcast --slow)
    F=contracts/deployments/safes-$CID.json
    [ -f "$F" ] || { echo "no $F written"; exit 1; }
    A=$(node -e "console.log(require('./$F').admin)"); G=$(node -e "console.log(require('./$F').guardian)"); O=$(node -e "console.log(require('./$F').ops)")
    sed -i '' "s|^ADMIN_SAFE=.*|ADMIN_SAFE=$A|; s|^GUARDIAN=.*|GUARDIAN=$G|; s|^OPS_SAFE=.*|OPS_SAFE=$O|" "$ENV_FILE"
    echo "Safes written to $ENV_FILE: admin $A, guardian $G, ops $O. Next: elysium.sh deploy"
    ;;
  deploy)
    for v in GUARDIAN ADMIN_SAFE OPS_SAFE WETH; do [ -n "${!v:-}" ] || { echo "$v is not set in $ENV_FILE"; exit 1; }; done
    if [ -f contracts/deployments/$CID.json ] && [ "${FORCE_REDEPLOY:-}" != "1" ]; then
      echo "refusing: contracts/deployments/$CID.json exists. FORCE_REDEPLOY=1 to deploy again."; exit 1
    fi
    (cd contracts && forge script script/DeployElysium.s.sol --rpc-url "$RPC" --account "$ACCOUNT" --broadcast --slow)
    echo "deployed. Next: elysium.sh plan"
    ;;
  plan)
    CHAIN_ID=$CID RPC_URL="$RPC" TIMELOCK_DELAY="${TIMELOCK_DELAY:-600}" node scripts/mainnet/timelock-calldata.mjs
    echo "plan saved: scripts/mainnet/out/timelock-$CID.json. Next: elysium.sh wire"
    ;;
  wire)
    SAFE="$ADMIN_SAFE" CHAIN_ID=$CID RPC_URL="$RPC" PLAN_FILE=scripts/mainnet/out/timelock-$CID.json node scripts/mainnet/safe-run.mjs "${2:-auto}"
    ;;
  sync)
    node scripts/sync-contracts.mjs
    echo "synced. Commit and push; then set up Render: kyte-indexer-elysium (CHAIN_ID=$CID), kyte-keeper-elysium, kyte-web-elysium (NEXT_PUBLIC_CHAIN_ID=$CID)."
    ;;
  *)
    echo "usage: $0 {safes|deploy|plan|wire|sync}"; exit 1
    ;;
esac
