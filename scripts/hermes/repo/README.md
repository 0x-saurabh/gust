# Kyte for Hermes Agent

Two [Hermes Agent](https://github.com/NousResearch/hermes-agent) skills and a one-block MCP config that put
[Kyte](https://kyte.sh), the non-custodial options market on Robinhood Chain, inside your own self-hosted agent.
Your model, your machine, your Telegram. Kyte never sees a key and never sends a transaction.

| Skill | What it does |
|---|---|
| `kyte-options` | Read offers, prices, positions, staking and rewards; prepare covered calls, puts, exercises and stakes as kyte.sh links you sign yourself. |
| `kyte-autopilot-watch` | A cron job that checks your Autopilot rules every N minutes and pushes each new trigger to your chat as a ready-to-sign link. |

## Install

1. Add the Kyte MCP server to `~/.hermes/config.yaml`:

   ```yaml
   mcp_servers:
     kyte:
       url: "https://kyte.sh/api/mcp"
       trust: untrusted   # reads never prompt; prepare_* tools ask once
   ```

   Run `/reload-mcp` in a session (or restart `hermes gateway`). You should see tools named `mcp_kyte_*`.

2. Install the skills from this tap:

   ```
   hermes skills tap add usekyte-org/hermes-kyte
   hermes skills install kyte-options
   hermes skills install kyte-autopilot-watch
   ```

3. Try it:

   > /kyte-options which PONS calls are open, and which is the best value?

   > /kyte-options prepare a covered call on 1000 HMM, 20% above spot, premium 0.0001 ETH, 1 day

## Autopilot alerts in Telegram

Autopilot is a rule you sign once on [kyte.sh/autopilot](https://kyte.sh/autopilot). Kyte watches the market and
prepares each action for you to sign. This cron job is the part that tells you:

```
hermes cron create "every 15m" \
  "Check Kyte Autopilot for wallet 0xYOUR_ADDRESS with the kyte-autopilot-watch skill. Report new triggers, otherwise reply [SILENT]." \
  --skill kyte-autopilot-watch --deliver telegram
```

Every run is read-only, so it works unattended with Hermes' default deny-on-approval cron policy. When nothing is
new the agent answers `[SILENT]` and nothing is sent.

## What it can and cannot do

- **Can:** read every public number on Kyte, explain an offer, compare offers, and prepare an action as a pre-filled
  kyte.sh link.
- **Cannot:** sign, send, spend, or read a key. There is no tool for it. You review and sign in your own wallet.
- Prepare tools are annotated as not read-only, so Hermes asks you once before the first call. That is the only
  prompt you will see.

## Limits

`https://kyte.sh/api/mcp` allows 120 requests a minute per IP. A 15-minute cron on a few wallets is far below that.

## Links

- Kyte MCP page and other clients: https://kyte.sh/mcp
- Kyte docs for agents: https://github.com/usekyte-org/kyte-docs/blob/main/agent.md
- Kyte is ERC-8004 agent #22541 on Robinhood Chain.

Options are risky and can expire worthless. Nothing here is investment advice. Kyte is not affiliated with or
endorsed by Robinhood.
