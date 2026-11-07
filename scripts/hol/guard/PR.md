# Draft PR to hashgraph-online/hol-guard

Not opened yet. Opening it is public; it needs the owner's go-ahead and a GitHub account to open it from (usekyte).

**Files** (copy into a fork of hol-guard):

- `contributions/mcp-servers/mcp.kyte.json`  <- `scripts/hol/guard/mcp.kyte.json`
- `contracts/extensions/trust/command.mcp-kyte.v1.json`  <- `scripts/hol/guard/command.mcp-kyte.v1.json`

Validated against `contracts/mcp-servers/contribution.v1.schema.json`. In the fork, before opening, run their checks
(the guide's step 2 and 5): `python scripts/refresh_extension_artifacts.py --check-trust` and
`pytest tests/test_guard_mcp_server_contribution.py`.

**Title:** Add Kyte options market MCP server (remote-http, read and prepare only)

**Body:**

Adds a catalog entry for the hosted Kyte MCP server (`https://kyte.sh/api/mcp`, streamable HTTP, no auth).

Kyte is a non-custodial options market on Robinhood Chain. The server exposes 13 read tools over public on-chain market
data and 5 prepare tools. A prepare tool validates inputs and returns a kyte.sh link the user reviews and signs in their
own wallet; the server holds no keys and sends no transactions.

- `trustClass: external`, `activation: opt-in`, `launch.kind: remote-http` with server name `kyte`.
- Reads `inherit` Guard's handling; every `prepare_*` tool and `other` are `review`. No `allow` defaults.
- Risk classes: `external-network-read`, `financial-data-read`.
- Icon: allowlisted `HiMiniGlobeAlt`.
- Tool annotations on the server match: reads `readOnlyHint: true`, prepares `readOnlyHint: false`, all
  `destructiveHint: false`.

Reference: https://kyte.sh/mcp

- [ ] `--check-trust` passes
- [ ] `tests/test_guard_mcp_server_contribution.py` passes
- [ ] No generated catalogs or directory files committed
