#!/usr/bin/env bash
# Register Kyte's agent identity on Robinhood Chain's ERC-8004 Identity Registry and write the agentId back into
# public/.well-known/agent-registration.json (the standard's "file names the agent back" proof). docs/HARMONIC.md.
#
#   scripts/mainnet/erc8004-register.sh            # mint from the `deployer` keystore (asks for its password once)
#   ACCOUNT=owner1 scripts/mainnet/erc8004-register.sh
#
# The identity is an ERC-721 held by the sender. Hand it to the ops Safe later with
#   cast send $REGISTRY "safeTransferFrom(address,address,uint256)" <sender> <opsSafe> <agentId> --account deployer
# Afterwards: commit the JSON, push, and once kyte.sh serves it check
#   https://harmonicagent.solutions/api/erc8004?id=<agentId>   (expects namesItBack: true)
set -euo pipefail
cd "$(dirname "$0")/../.."
CAST=${CAST:-$HOME/.foundry/bin/cast}
RPC=${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}
ACCOUNT=${ACCOUNT:-deployer}
REGISTRY=0x8004A169FB4a3325136EB29fA0ceB6D2e539a432   # eip155:4663, "AgentIdentity"
URI=https://kyte.sh/.well-known/agent-registration.json
FILE=public/.well-known/agent-registration.json

if [[ "$($CAST chain-id --rpc-url "$RPC")" != "4663" ]]; then echo "not Robinhood Chain mainnet"; exit 1; fi
if ! curl -sf -m 15 "$URI" | grep -q '"eip-8004#registration-v1"'; then echo "$URI is not live yet; deploy the site first"; exit 1; fi
if grep -q '"agentId"' "$FILE"; then echo "$FILE already carries a registration"; exit 1; fi

echo "== register(string) on $REGISTRY from keystore $ACCOUNT"
TX=$($CAST send "$REGISTRY" "register(string)" "$URI" --account "$ACCOUNT" --rpc-url "$RPC" --json | python3 -c 'import sys,json; print(json.load(sys.stdin)["transactionHash"])')
echo "tx $TX"
# Registered(uint256 indexed agentId, string agentURI, address indexed owner): topic1 is the id.
TOPIC=$($CAST keccak "Registered(uint256,string,address)")
ID_HEX=$($CAST receipt "$TX" --rpc-url "$RPC" --json | python3 -c "import sys,json; r=json.load(sys.stdin); print(next(l['topics'][1] for l in r['logs'] if l['topics'][0].lower()=='$TOPIC'.lower()))")
AGENT_ID=$($CAST to-dec "$ID_HEX")
echo "agentId $AGENT_ID"

python3 - "$FILE" "$AGENT_ID" <<'PY'
import json, sys
p, aid = sys.argv[1], int(sys.argv[2])
d = json.load(open(p))
d["registrations"] = [{"agentId": aid, "agentRegistry": "eip155:4663:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"}]
json.dump(d, open(p, "w"), indent=2); open(p, "a").write("\n")
PY
echo "wrote registrations into $FILE. Next: git add $FILE && git commit -m 'ERC-8004: Kyte is agent #$AGENT_ID' && git push"
echo "then: https://harmonicagent.solutions/api/erc8004?id=$AGENT_ID"
