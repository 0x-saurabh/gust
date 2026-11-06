#!/usr/bin/env bash
# Switch the protocol to a new $KYTE token with ONE argument: the token's contract address.
#
#   scripts/mainnet/kyte-token.sh 0xYourToken            # checks, asks once, then does everything
#   scripts/mainnet/kyte-token.sh 0xYourToken --yes      # no question
#   scripts/mainnet/kyte-token.sh 0xYourToken --per-eth 2000000   # opening pool price in whole KYTE per ETH
#                                                                  # (default: the value in scripts/mainnet/.env,
#                                                                  #  else 1,000,000 KYTE per ETH)
#
# What happens, in order (safe to re-run: every step skips what is already done):
#   0. preflight: address is a contract on Robinhood Chain mainnet, ERC-20, 18 decimals; prints symbol, supply and
#      how much of it the deployer wallet holds (that wallet seeds the pool).
#   1. records KYTE_TOKEN and KYTE_PER_ETH in scripts/mainnet/.env, the file every mainnet script reads.
#   2. scripts/mainnet/kyte-launch.sh: new StakingPool + BuybackBurner, deployment file, KYTE/WETH pool + adapter,
#      the timelock Safe transaction (fee destinations, burner, Market listing), site config, verify, commit, push.
#      Render then redeploys the site, indexer and keeper from main.
#   3. verifies on chain that everything now points at the new token: the StakingPool's stakeToken (staking holds its
#      token as an immutable, so a NEW pool is deployed and the FeeVault is pointed at it; Stake page approvals
#      target the new token), the BuybackBurner's token, FeeVault.stakingPool/buybackBurner, AssetRegistry.isEnabled,
#      and the website's generated config. Any mismatch stops the script with what to do.
#   4. refreshes the local macOS services (~/.kyte/app) so the indexer on :4201 sees the new token too.
#
# Afterwards: add KYTE/WETH liquidity from the treasury wallet. The chart and the buyback start with the first swap.
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE=scripts/mainnet/.env
CAST=${CAST:-$HOME/.foundry/bin/cast}
RPC=${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}
DEP=contracts/deployments/4663.json

TOKEN=""; PER_ETH_WHOLE=""; YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) YES=1 ;;
    --per-eth) PER_ETH_WHOLE="${2:?--per-eth needs a number}"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    0x*) TOKEN="$1" ;;
    *) echo "unknown argument: $1"; exit 1 ;;
  esac
  shift
done
[ -n "$TOKEN" ] || { echo "usage: $0 0xTokenAddress [--per-eth KYTE_PER_ETH_WHOLE] [--yes]"; exit 1; }
[[ "$TOKEN" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "not an address: $TOKEN"; exit 1; }
[ -x "$CAST" ] || { echo "cast not found at $CAST (install Foundry)"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy scripts/mainnet/env.example and fill it in)"; exit 1; }
lc() { echo "$1" | tr A-F a-f; }

echo "== 0/4 preflight"
for i in $(seq 1 20); do
  CID=$($CAST chain-id --rpc-url "$RPC" 2>/dev/null) && break
  echo "   RPC not reachable yet (attempt $i/20), retrying in 3 s..."; sleep 3
done
[ "${CID:-}" = 4663 ] || { echo "RPC is not Robinhood Chain mainnet (chain id '${CID:-none}'): nothing was done"; exit 1; }
CODE=$($CAST code "$TOKEN" --rpc-url "$RPC" 2>/dev/null || echo 0x)
[ ${#CODE} -gt 48 ] || { echo "no contract at $TOKEN on mainnet"; exit 1; }
DEC=$($CAST call "$TOKEN" 'decimals()(uint8)' --rpc-url "$RPC" 2>/dev/null || echo "?")
[ "$DEC" = 18 ] || { echo "$TOKEN is not an 18-decimal ERC-20 (decimals() returned '$DEC')"; exit 1; }
SYM=$($CAST call "$TOKEN" 'symbol()(string)' --rpc-url "$RPC" 2>/dev/null | tr -d '"' || echo "?")
NAME=$($CAST call "$TOKEN" 'name()(string)' --rpc-url "$RPC" 2>/dev/null | tr -d '"' || echo "?")
SUPPLY=$($CAST call "$TOKEN" 'totalSupply()(uint256)' --rpc-url "$RPC" | awk '{printf "%.0f", $1/1e18}')
[ "$SUPPLY" != 0 ] || { echo "$SYM has zero supply: mint before launching"; exit 1; }
DEPLOYER=$($CAST wallet address --account "${ACCOUNT:-deployer}" 2>/dev/null || echo "")
if [ -n "$DEPLOYER" ]; then
  HELD=$($CAST call "$TOKEN" 'balanceOf(address)(uint256)' "$DEPLOYER" --rpc-url "$RPC" | awk '{printf "%.0f", $1/1e18}')
  DEPLOYER_LINE="$DEPLOYER holds $HELD $SYM  (this wallet seeds the KYTE/WETH pool)"
else
  DEPLOYER_LINE="keystore '${ACCOUNT:-deployer}' is locked: forge asks for its password at each deploy step"
fi
CURRENT=$(node -p "require('./$DEP').kyteToken || ''")
if [ "$(lc "$CURRENT")" = "$(lc "$TOKEN")" ] && [ "$(lc "$(node -p "require('./$DEP').launch?.kyteToken || ''")")" = "$(lc "$TOKEN")" ]; then
  echo "   $TOKEN is already the live \$KYTE in $DEP; continuing lets kyte-launch.sh finish any step that is left"
fi

# opening price: flag (whole KYTE per ETH) > existing .env value (raw) > 1,000,000 per ETH
if [ -n "$PER_ETH_WHOLE" ]; then
  [[ "$PER_ETH_WHOLE" =~ ^[0-9]+$ ]] || { echo "--per-eth must be a whole number of KYTE per ETH"; exit 1; }
  PER_ETH_RAW=$(node -p "(BigInt('$PER_ETH_WHOLE') * 10n ** 18n).toString()")
else
  PER_ETH_RAW=$(sed -n 's/^KYTE_PER_ETH=\([0-9]*\).*/\1/p' "$ENV_FILE" | head -1)
  [ -n "$PER_ETH_RAW" ] || PER_ETH_RAW=1000000000000000000000000
fi
PER_ETH_SHOW=$(node -p "(BigInt('$PER_ETH_RAW') / 10n ** 18n).toLocaleString('en-US')")

cat <<SUMMARY

   token        $TOKEN
   name/symbol  $NAME / $SYM
   supply       $SUPPLY $SYM
   deployer     $DEPLOYER_LINE
   pool price   $PER_ETH_SHOW $SYM per ETH at opening
   replaces     ${CURRENT:-none} (kept under legacyKyte; its staking pool stays claimable)

   Steps: deploy StakingPool + BuybackBurner, KYTE/WETH pool + adapter, ONE timelock Safe transaction
   (fees to the new pool and burner, $SYM listed on Market), site config, verify, commit, push to main.
SUMMARY
if [ $YES != 1 ]; then
  read -r -p "   Proceed? [y/N] " ans
  [ "${ans:-}" = y ] || [ "${ans:-}" = Y ] || { echo "stopped, nothing was sent"; exit 1; }
fi

echo "== 1/4 record in $ENV_FILE"
set_env() { if grep -q "^$1=" "$ENV_FILE"; then sed -i '' -E "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi; }
set_env KYTE_TOKEN "$(lc "$TOKEN")"
set_env KYTE_PER_ETH "$PER_ETH_RAW"
echo "   KYTE_TOKEN=$(lc "$TOKEN")  KYTE_PER_ETH=$PER_ETH_RAW"

echo "== 2/4 launch (deploy, pool, timelock, publish)"
KYTE_TOKEN="$(lc "$TOKEN")" KYTE_PER_ETH="$PER_ETH_RAW" scripts/mainnet/kyte-launch.sh

echo "== 3/4 verify on chain: staking, burner, fee vault, listing, site config"
rd() { node -p "require('./$DEP').$1 || ''"; }
POOL=$(rd stakingPool); BURNER=$(rd buybackBurner); VAULT=$(rd feeVault)
# the live markets' registry: v3 reuses v2's; the top-level one is v1 (same choice as kyte-launch-plan.mjs)
REG=$(node -p "const d=require('./$DEP'); (d.v3 && d.v3.assetRegistry) || (d.v2 && d.v2.assetRegistry) || d.assetRegistry")
call() { $CAST call "$1" "$2" "${@:3}" --rpc-url "$RPC" 2>/dev/null | tr -d '"' || echo "?"; }
FAIL=0
check() { # check <label> <got> <want> <hint>
  if [ "$(lc "$2")" = "$(lc "$3")" ]; then echo "   ok    $1: $2"; else echo "   FAIL  $1: got $2, want $3"; echo "         -> $4"; FAIL=1; fi
}
check "StakingPool.stakeToken   (staking accepts the new \$KYTE)" "$(call "$POOL" 'stakeToken()(address)')" "$TOKEN" \
  "the deployment file's stakingPool is not a pool for this token: re-run to redeploy (DeployKyteLaunch) and apply"
check "BuybackBurner.token      (burner buys and burns the new \$KYTE)" "$(call "$BURNER" 'token()(address)')" "$TOKEN" \
  "the deployment file's buybackBurner is bound to another token: re-run to redeploy and apply"
check "FeeVault.stakingPool     (30% of fees go to the new pool)" "$(call "$VAULT" 'stakingPool()(address)')" "$POOL" \
  "the timelock setDestinations has not executed yet: wait for the delay, then re-run (the Safe step resumes)"
check "FeeVault.buybackBurner   (20% of fees go to the new burner)" "$(call "$VAULT" 'buybackBurner()(address)')" "$BURNER" \
  "same timelock transaction as above: re-run once the delay has passed"
check "AssetRegistry.isEnabled  (\$KYTE options listed on Market)" "$(call "$REG" 'isEnabled(address)(bool)' "$TOKEN")" "true" \
  "the timelock addAsset has not executed yet: re-run after the delay, or set KYTE_CAP / KYTE_MIN_STRIKE and re-run"
check "site config kyteToken    (Stake page approves the new token)" "$(node -p "require('./src/lib/generated/deployments.json')['4663']?.kyteToken || require('./src/lib/generated/deployments.json').kyteToken || ''")" "$TOKEN" \
  "run: node scripts/sync-contracts.mjs && git add src/lib/generated && git commit && git push"
check "site config stakingPool  (Stake page talks to the new pool)" "$(node -p "require('./src/lib/generated/deployments.json')['4663']?.stakingPool || require('./src/lib/generated/deployments.json').stakingPool || ''")" "$POOL" \
  "run: node scripts/sync-contracts.mjs && git add src/lib/generated && git commit && git push"
if [ $FAIL = 1 ]; then
  echo "   some checks failed: fix the hints above and re-run this same command; it resumes where it stopped"
  exit 1
fi
echo "   staking, burner, fee vault, listing and site all point at $SYM"

echo "== 4/4 local services"
if [ -d "$HOME/.kyte/app" ] && [ -f "$HOME/Library/LaunchAgents/sh.kyte.indexer.plist" ]; then
  # The launchd indexer/keeper run from a copy on the internal disk, not from this folder: refresh it and restart.
  ops/install-macos-services.sh
  for i in $(seq 1 30); do curl -s localhost:4201/health >/dev/null 2>&1 && break; sleep 2; done
  if curl -s "localhost:4201/assets" 2>/dev/null | grep -qi "$(lc "$TOKEN")"; then
    echo "   local indexer lists $SYM"
  else
    echo "   local indexer does not list $SYM yet (it catches up once the timelock listing is mined; check ~/Library/Logs/kyte-indexer.log)"
  fi
else
  echo "   no local launchd services found, skipped (Render redeploys from main on its own)"
fi

cat <<DONE

Done. \$KYTE is now $TOKEN ($SYM).
Next, from the treasury wallet: add $SYM/WETH liquidity to the Uniswap v4 pool. The Market chart, the burner and
the stakers' fee share start with the first swap. Site, indexer and keeper redeploy on Render from main.
DONE
