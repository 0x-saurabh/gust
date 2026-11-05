#!/bin/bash
# Move ETH out of the keeper wallet (a plain EOA whose key is in ~/.kyte/keeper.key, see set-keeper-key.sh).
#   ops/keeper-withdraw.sh --check                 show the keeper address and its balance
#   ops/keeper-withdraw.sh <to> <amount-eth>       send that much ETH to <to>
#   ops/keeper-withdraw.sh <to> all                send everything except gas for the transfer
# The key never leaves this machine; cast signs locally and only the signed transaction goes to the RPC.
set -euo pipefail
KEY_FILE="${KEEPER_PRIVATE_KEY_FILE:-$HOME/.kyte/keeper.key}"
RPC="${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
CAST="${CAST:-$HOME/.foundry/bin/cast}"
[ -x "$CAST" ] || { echo "cast not found at $CAST (install foundry or set CAST=)"; exit 1; }
[ -s "$KEY_FILE" ] || { echo "no keeper key at $KEY_FILE. Run ops/set-keeper-key.sh first."; exit 1; }
ADDR=$("$CAST" wallet address --private-key "$(cat "$KEY_FILE")")
BAL_WEI=$("$CAST" balance "$ADDR" --rpc-url "$RPC")
BAL_ETH=$("$CAST" from-wei "$BAL_WEI")
if [ "${1:-}" = "--check" ] || [ $# -eq 0 ]; then
  echo "keeper $ADDR"
  echo "balance $BAL_ETH ETH on $RPC"
  exit 0
fi
TO="$1"; AMOUNT="$2"
[[ "$TO" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "bad destination address: $TO"; exit 1; }
GAS_PRICE=$("$CAST" gas-price --rpc-url "$RPC")
RESERVE=$(( 21000 * GAS_PRICE * 2 ))   # gas for this transfer, twice over
if [ "$AMOUNT" = "all" ]; then
  VALUE=$(( BAL_WEI - RESERVE ))
  [ "$VALUE" -gt 0 ] || { echo "balance $BAL_ETH ETH is below the gas reserve; nothing to send"; exit 1; }
else
  VALUE=$("$CAST" to-wei "$AMOUNT" ether)
  [ $(( VALUE + RESERVE )) -le "$BAL_WEI" ] || { echo "balance $BAL_ETH ETH is not enough for $AMOUNT ETH plus gas"; exit 1; }
fi
echo "sending $("$CAST" from-wei "$VALUE") ETH from keeper $ADDR to $TO"
"$CAST" send "$TO" --value "$VALUE" --private-key "$(cat "$KEY_FILE")" --rpc-url "$RPC" --gas-limit 21000
echo "left: $("$CAST" from-wei "$("$CAST" balance "$ADDR" --rpc-url "$RPC")") ETH"
