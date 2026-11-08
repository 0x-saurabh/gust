# Install Kyte MCP

Kyte is a hosted MCP server. There is nothing to build or run locally: every client connects to one URL.

```
https://kyte.sh/api/mcp
```

No account, no API key. Read tools return live on-chain data; prepare tools return a kyte.sh link you sign in your
own wallet. The server never signs or sends a transaction.

## Claude (claude.ai, desktop, mobile)

1. Settings, then **Connectors**, then **Add custom connector**.
2. Name: `Kyte`. URL: `https://kyte.sh/api/mcp`.
3. Click **Add**, then **Connect**.

## Claude Code

```bash
claude mcp add --transport http --scope user kyte https://kyte.sh/api/mcp
```

Or install this repository as a plugin: `.claude-plugin/plugin.json` and `.mcp.json` point at the same server.

## ChatGPT

Settings, then **Connectors**, then **Create**. Paste `https://kyte.sh/api/mcp` and enable it in a chat.

## Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kyte": { "url": "https://kyte.sh/api/mcp" }
  }
}
```

## Codex

Install this repository as a plugin; `.codex-plugin/plugin.json` points at the server.

## Gemini CLI

```bash
gemini extensions install https://github.com/usekyte-org/kyte-mcp
```

`gemini-extension.json` points at the server.

## Run it under HOL Guard

```bash
pipx install hol-guard
hol-guard init
```

Allow the read tools and keep the prepare tools on review.

## Check it works

Ask your AI:

> Which Pons launchpad tokens are listed on Kyte right now?

You should get a live list of tokens with prices.
