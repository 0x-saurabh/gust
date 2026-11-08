# Kyte on HOL (Hashgraph Online)

Status as of 8 November 2026.

[HOL](https://hol.org) runs a **registry** of AI agents and MCP servers, an **AI Plugin Registry** with a launch feed,
and **HOL Guard**, a local tool that checks MCP servers and asks before risky tool calls. Kyte's MCP server is live on
HOL and ready to use.

```
https://kyte.sh/api/mcp
```

## Live and ready to use

| Piece | Status | Link |
|---|---|---|
| Kyte MCP server | Live, 20 tools, no login | https://kyte.sh/api/mcp |
| MCP page on kyte.sh, with "Run it under HOL Guard" | Live | https://kyte.sh/mcp |
| HOL registry listing | Live | [registry profile](https://hol.org/registry/agent/uaid:aid:2P6i4mmnXKNeBw4SkxwGre4AptYWs3hB5kZGBtcKocEvytjLjuxDUHLoT6PuBHw6sx) |
| DNS ownership record `_hedera.kyte.sh` | Live | TXT `0.0.10949843` |
| Logo inscribed on Hedera | Live | `hcs://1/0.0.10949965` |
| HOL Plugin Registry listing | Live, owner-verified as @usekyte | https://hol.org/registry/plugins/usekyte%2Fkyte-mcp |
| HOL launch | Live, launched 8 Nov 2026 | same page, Launch history |
| awesome-ai-plugins entry | Merged | hashgraph-online/awesome-ai-plugins |
| Plugin source on GitHub | Live, with install guide | https://github.com/usekyte-org/kyte-mcp |

## 1. The Kyte MCP server

Anyone can connect it, with no account and no keys.

| | |
|---|---|
| Endpoint | `https://kyte.sh/api/mcp` |
| Transport | Streamable HTTP, stateless |
| Tools | 20: 14 read, 6 prepare |
| Resources | 6 docs |
| Prompts | 3 |
| Safety | Prepare tools return a kyte.sh link; the user signs in their own wallet. The server never signs or sends. |

### Connect it

- **Claude (claude.ai, desktop, mobile):** Settings, Connectors, Add custom connector. Name `Kyte`, URL
  `https://kyte.sh/api/mcp`.
- **Claude Code:**
  ```bash
  claude mcp add --transport http --scope user kyte https://kyte.sh/api/mcp
  ```
- **ChatGPT:** Settings, Connectors, Create, paste the URL.
- **Cursor:** add to `~/.cursor/mcp.json`:
  ```json
  { "mcpServers": { "kyte": { "url": "https://kyte.sh/api/mcp" } } }
  ```

### Try it

> Which Pons launchpad tokens are listed on Kyte right now?

> What are Kyte's protocol stats?

> What PONS calls are open, and which is the best value?

> Prepare a covered call on 1000 HMM, 20% above spot, premium 0.0001 ETH, 1 day.

### Tested

Tested on 8 Nov 2026 in claude.ai with the custom connector:

- `list_graduated` returned all six Pons tokens listed on Kyte, including HMM, auto-listed that night.
- `get_protocol_stats` returned live protocol data.
- `prepare_covered_call` asked for its own, separate permission before running. Read and prepare tools carry different
  `readOnlyHint` annotations, so Claude keeps them apart.

## 2. HOL registry listing

| | |
|---|---|
| Name | Kyte Options Market |
| UAID | `uaid:aid:2P6i4mmnXKNeBw4SkxwGre4AptYWs3hB5kZGBtcKocEvytjLjuxDUHLoT6PuBHw6sx` |
| Agent id | `agent_75973947` |
| Endpoint | `https://kyte.sh/api/mcp` |
| Ownership | DNS TXT `_hedera.kyte.sh` = `0.0.10949843` |
| Logo | `hcs://1/0.0.10949965` |
| HOL account | contact@kyte.sh |

Any agent that searches HOL's registry broker can find Kyte and call its endpoint directly.

## 3. HOL Plugin Registry and launch

| | |
|---|---|
| Listing | https://hol.org/registry/plugins/usekyte%2Fkyte-mcp |
| Owner | Claimed and verified as @usekyte |
| Scanner score | 83 (75 needed) |
| Launch | Live on HOL's launch feed: v1.0.0, Tools & Integrations, Free |
| Media | 4 images |
| Source | https://github.com/usekyte-org/kyte-mcp, install guide in `docs/INSTALL.md` |
| Also listed in | hashgraph-online/awesome-ai-plugins |

## 4. HOL Guard

https://kyte.sh/mcp has a "Run it under HOL Guard" section:

```bash
pipx install hol-guard
hol-guard init
```

Recommended policy: allow the read tools, keep the prepare tools on review.

## How it works

```
User in Claude / ChatGPT / Cursor
        |
        |  finds Kyte on HOL (registry, plugin page, launch feed)
        v
https://kyte.sh/api/mcp  ---- reads ---->  Kyte indexer  ---->  Robinhood Chain
        |
        |  prepare tools return a kyte.sh link
        v
User opens the link and signs in their own wallet
```

HOL Guard runs on the user's machine between the AI app and the server. It lets reads through and asks before prepare
calls.

## Files in this repo

| Path | What it is |
|---|---|
| `scripts/hol/profile.mjs` | Builds the HCS-11 MCP profile from the live server |
| `scripts/hol/register.mjs` | Quote and register with the HOL Registry Broker |
| `scripts/hol/kyte-profile.json` | The generated profile |
| `scripts/hol/guard/` | HOL Guard catalog entry and trust contract |
| `scripts/hol/plugin/` | Plugin manifests for Claude, Codex, Cursor and Gemini, README, SECURITY.md, skill, icon |
| `scripts/hol/launch-media/` | Launch images |
| `docs/HOL_REGISTRY.md` | Registration runbook and record |
| `src/components/mcp/McpPage.tsx` | kyte.sh/mcp page, including the HOL Guard section |

## Contact

contact@kyte.sh · https://kyte.sh · https://github.com/usekyte-org · https://x.com/useKyte
