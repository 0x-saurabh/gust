#!/usr/bin/env bash
# Mainnet (or testnet) deploy, in one place. Verification runs after, via Sourcify (scripts/mainnet/verify.mjs):
# Blockscout sits behind a Cloudflare bot check that blocks forge's verifier. Signs with a Foundry keystore, never a raw key.
#
#   1. cast wallet import deployer --interactive        # once; paste the key only into this prompt
#   2. cp scripts/mainnet/env.example scripts/mainnet/.env && edit it
#   3. scripts/mainnet/deploy.sh                        # Deploy.s.sol + verify
#   4. scripts/mainnet/deploy.sh adapter                # DeployAdapter.s.sol + verify
#   5. node scripts/mainnet/timelock-calldata.mjs       # Safe transactions for the post-deploy wiring
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE=scripts/mainnet/.env
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy scripts/mainnet/env.example)"; exit 1; }
set -a; . "$ENV_FILE"; set +a

FORGE=${FORGE:-$HOME/.foundry/bin/forge}
ACCOUNT=${ACCOUNT:-deployer}
RPC=${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}
VERIFIER_URL=${VERIFIER_URL:-https://robinhoodchain.blockscout.com/api/}
STEP=${1:-core}

for v in GUARDIAN ADMIN_SAFE OPS_SAFE KEEPER KYTE_TOKEN WETH POOL_MANAGER; do
  [ -n "${!v:-}" ] || { echo "$v is not set in $ENV_FILE"; exit 1; }
done
grep -q -i "private" "$ENV_FILE" && { echo "refusing: $ENV_FILE contains a private key; use the keystore"; exit 1; }

# (no balance pre-check here: reading the keystore address needs the password, which forge asks for once below)
echo "deploying with keystore '$ACCOUNT' on $RPC"
# Wait out DNS/RPC blips before signing anything (the home router's DNS drops lookups now and then).
for i in $(seq 1 20); do
  CID=$(~/.foundry/bin/cast chain-id --rpc-url "$RPC" 2>/dev/null) && break
  echo "  RPC not reachable yet (attempt $i/20), retrying in 3 s..."; sleep 3
done
[ -n "${CID:-}" ] || { echo "RPC unreachable after 20 tries: check your internet connection, nothing was sent"; exit 1; }
echo "RPC ok: chain $CID"

cd contracts
case "$STEP" in
  core)
    shift || true
    if [ -f deployments/$CID.json ] && [ "${FORCE_REDEPLOY:-}" != "1" ]; then
      echo "refusing: deployments/$CID.json already exists (a protocol is deployed). Set FORCE_REDEPLOY=1 to deploy a second one."; exit 1
    fi
    $FORGE script script/Deploy.s.sol --rpc-url "$RPC" --account "$ACCOUNT" --broadcast --slow "$@"
    ;;
  adapter)
    shift || true
    : "${KYTE_PER_ETH:?set KYTE_PER_ETH (raw KYTE units per 1 ETH) in $ENV_FILE}"
    $FORGE script script/DeployAdapter.s.sol --rpc-url "$RPC" --account "$ACCOUNT" --broadcast --slow "$@"
    ;;
  verify)
    # Sourcify verification for everything in the deployment file (Blockscout imports it). No key needed.
    cd ..; node scripts/mainnet/verify.mjs; exit 0
    ;;
  *) echo "usage: $0 [core|adapter|verify]"; exit 1 ;;
esac
cd ..
node scripts/sync-contracts.mjs
echo "done: contracts/deployments/$(~/.foundry/bin/cast chain-id --rpc-url "$RPC").json synced into src/lib/generated"
