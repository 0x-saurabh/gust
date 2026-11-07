# Ask Kyte: the agent and the MCP server

Kyte answers plain-language questions from live on-chain data, inside kyte.sh and from any AI app that speaks MCP.

## On kyte.sh

Click **Ask Kyte** on any page, or open [kyte.sh/agent](https://kyte.sh/agent). Ask things like:

- What are the best open covered calls on PONS right now?
- Explain this offer: what do I pay, and when is it worth exercising?
- What do I hold, and what expires this week? (uses your connected wallet's address, nothing else)
- How much has been burned, and what do stakers earn?
- Set up a covered call on 10 PONS at 20% above spot for one week.

For an action the agent prepares a review card and a pre-filled form. You read it and sign in your own wallet,
exactly as on kyte.sh today. The agent never sees a key and cannot send a transaction.

## From Claude, ChatGPT, Cursor or any MCP client

Add this URL as a custom connector or MCP server:

```
https://kyte.sh/api/mcp
```

No login is needed: all data is public on chain, and you pass your address as a parameter when you want your own
positions. The server exposes:

| | |
|---|---|
| Read tools | `list_tokens`, `find_offers`, `get_offer`, `get_positions`, `get_prices`, `get_chart`, `get_staking`, `get_protocol_stats`, `get_proof`, `get_activity`, `explain_offer`, `compare_offers` |
| Prepare tools | `prepare_buy`, `prepare_covered_call`, `prepare_cash_secured_put`, `prepare_exercise`, `prepare_stake`: each returns a preview and a kyte.sh link, never a transaction |
| Resources | These docs pages, as `kyte://docs/how-it-works`, `fees`, `staking`, `rules`, `risks`, `glossary` |
| Prompts | `find_best_offers`, `explain_my_positions`, `protocol_health` |

In Claude: Settings, Connectors, Add custom connector, paste the URL. In ChatGPT: Settings, Connectors, Create, paste
the URL. In Cursor: add `{"kyte": {"url": "https://kyte.sh/api/mcp"}}` under `mcpServers`.

## Ground rules

- Non-custodial, always. No tool can move funds, sign or read a key.
- Information, not advice. The agent explains numbers; it does not tell you what to trade.
- Every number comes from the Kyte indexer, the same API the website uses.
- Anything read from the chain is treated as data, never as instructions.
- Rate limited per wallet, address or client. Conversations on kyte.sh are not stored.

Options are risky and can expire worthless. Nothing here is investment advice.
