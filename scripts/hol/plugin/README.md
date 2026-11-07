# Kyte MCP

Connect Claude Code, Codex, Cursor or Gemini to [Kyte](https://kyte.sh), the non-custodial options market on Robinhood
Chain. One remote MCP server, `https://kyte.sh/api/mcp`, streamable HTTP, no account or key needed.

- 13 read tools: markets, offers, prices, charts, positions, staking, protocol stats, fee proof, activity, Pons launchpad.
- 5 prepare tools: they return a kyte.sh link the user reviews and signs in their own wallet.
- The server holds no keys and sends no transactions. Prepare tools are annotated as not read-only, so clients ask
  before calling them.

## Install

```bash
claude mcp add --transport http kyte https://kyte.sh/api/mcp          # Claude Code
```

Or install this repository as a plugin in Claude Code, Codex, Cursor or Gemini; each manifest points at the same server.

## Run it under HOL Guard

[HOL Guard](https://hol.org/guard) lets you allow, ask or block each tool call locally. Kyte's catalog entry marks every
read as Guard's normal handling and every prepare tool for review.

## Security

Read-only by design. Report issues to contact@kyte.sh. Options are risky and can expire worthless; information, not
financial advice.
