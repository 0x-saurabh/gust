# Video: the Kyte MCP server

Purpose: a 2–3 minute explainer or demo for X / YouTube. Everything below is true as of 9 Nov 2026 and was verified
against production (live handshake on kyte.sh/mcp, `src/app/api/mcp/route.ts`, `src/lib/agent/tools.ts`).
Numbers in brackets are what the screen shows today; re-check on the day of recording.

Audience: people who use Claude, ChatGPT, Cursor, Claude Code or a self-hosted agent, and hold tokens on Robinhood
Chain. Secondary: other builders on Robinhood Chain who want to see what "agent-ready" looks like.

One-line pitch: **"One URL puts a live options market inside any AI app. It can read everything and prepare any
trade. It can never sign one."**

---

## 0. Facts you can say on camera

| Claim | True? | Source |
|---|---|---|
| Endpoint `https://kyte.sh/api/mcp`, no account, no API key | Yes | route.ts; CORS `*`, nothing checks an auth header |
| Streamable HTTP, **stateless**: a fresh server per request, no session id | Yes | `sessionIdGenerator: undefined`, `enableJsonResponse: true` |
| 21 tools: 15 read, 6 prepare | Yes | live `tools/list` |
| Read tools are annotated `readOnlyHint: true`; prepare tools are not, so clients ask before running them | Yes | route.ts annotations; tested in claude.ai and Hermes |
| No tool can sign, send, spend or read a key; prepare tools return a kyte.sh link the user signs | Yes | tools.ts, every prepare tool returns `{preview, link, signs, disclaimer}` |
| 7 docs as MCP resources (`kyte://docs/how-it-works`, fees, staking, rewards, rules, risks, glossary) | Yes | route.ts `DOCS` |
| 3 prompts: `find_best_offers`, `explain_my_positions`, `protocol_health` | Yes | route.ts |
| Same tool code as the in-app agent "Ask Kyte" | Yes | both import `ALL_TOOLS` |
| Every number comes from the Kyte indexer, the same API the site uses (3 s cache) | Yes | tools.ts `api()` |
| Stock-token prices carry a session state (open, held, halted, paused, stale) with a warning sentence | Yes | Harmonic Agent integration, `sessionWarning()` |
| Rate limit 120 requests a minute per IP | Yes | route.ts |
| Clients shown on the page: Claude, ChatGPT, Cursor, Claude Code, Hermes Agent | Yes | kyte.sh/mcp connection map runs a real handshake per client |
| Listed in the official MCP Registry as `sh.kyte/kyte` (domain-verified) | Yes | registry.modelcontextprotocol.io, 9 Nov 2026 |
| Listed in the HOL registry with a Guard policy; public source at github.com/usekyte-org/kyte-mcp | Yes | docs/HOL.md |
| Kyte is ERC-8004 agent #22541 on Robinhood Chain | Yes | `/.well-known/agent-registration.json` |
| Hermes plugin catalog, DefiLlama | **PRs open, not merged** | say "submitted", not "listed" |

Do not say: "the AI trades for you", "autonomous trading", "the bot buys". Say: "reads", "prepares", "you sign".

### The 21 tools (for an on-screen list)

Read: `list_tokens`, `find_offers`, `get_offer`, `get_positions`, `get_prices`, `get_chart`, `get_staking`,
`get_protocol_stats`, `get_proof`, `get_activity`, `explain_offer`, `compare_offers`, `list_graduated`,
`list_strategies`, `get_rewards`.
Prepare: `prepare_buy`, `prepare_covered_call`, `prepare_cash_secured_put`, `prepare_exercise`, `prepare_stake`,
`design_strategy`.

---

## 1. What we built (the story behind the demo)

1. **One tool set, two front doors.** The read and prepare tools were written once (`src/lib/agent/tools.ts`) for the
   in-app agent. The MCP route exposes the same list to the outside world, so Ask Kyte and every MCP client answer
   identically.
2. **Prepare, never sign.** Each prepare tool validates against protocol rules (listed token, min strike, expiry
   window, puts enabled, fee maths) and returns a preview plus a pre-filled kyte.sh link: `/market?buy=<id>`,
   `/sell?kind=&token=&strike=…`, `/positions?exercise=<id>`, `/stake?action=`, `/autopilot?rule=<base64>`. The
   page reads the query string, the wallet signs. The server has no key and no send path.
3. **Honest annotations.** Read tools carry `readOnlyHint: true`; prepare tools do not. That single bit is why
   Claude, Hermes and HOL Guard ask before a prepare and never before a read.
4. **Stateless on purpose.** No sessions, no cookies, no stored state. Any client, any number of them, behind one
   URL; the only memory is a per-IP rate counter.
5. **Context, not just data.** Seven docs pages as resources and three starter prompts, so a client grounds its
   answers in Kyte's real text instead of guessing fees and rules.
6. **Market truth.** Stock tokens come with Harmonic's session state; a quote on a halted or weekend-held stock is
   labelled as the last print, and the agent is told to pass that on.
7. **Autopilot from chat.** `design_strategy` turns a sentence ("sell a covered call on 1000 HMM every week, 20%
   above spot") into a validated rule, explains it, backtests it over 30 days of prices and hands back the link where
   the user signs a free message. Kyte then watches and prepares; `list_strategies` shows what is waiting.
8. **Distribution.** Connect guides for Claude, ChatGPT, Cursor, Claude Code and Hermes Agent on kyte.sh/mcp; a live
   connection map that performs the real handshake for each; HOL registry + Guard policy; the official MCP Registry
   under our own domain; ERC-8004 identity; a public plugin repo and a Hermes skills tap.
9. **Observability.** The route logs the client name on every `initialize`, so we can see which agents actually
   use it.

---

## 2. Script (English, ~2:40)

### Scene 1 · Hook (0:00–0:12)
**Screen:** kyte.sh/mcp hero. The connection map lights up Claude, ChatGPT, Cursor, Hermes, Claude Code one by one; "5/5 connected · 21 tools".
**VO:** "Those five threads are real. Each one just did an MCP handshake with Kyte's options market, live. One URL, no account, no key. Let me show you what an AI can do with it, and the one thing it can't."

### Scene 2 · Connect in 20 seconds (0:12–0:40)
**Screen:** claude.ai → Settings → Connectors → Add custom connector → name `Kyte`, URL `https://kyte.sh/api/mcp`. Then the Cursor JSON and the Claude Code one-liner on the Connect tabs.
**VO:** "Paste the URL. That's the whole setup. Claude, ChatGPT, Cursor, Claude Code and Hermes all speak MCP, so the same endpoint works everywhere. The server is stateless, no login, no session. It just answers."

### Scene 3 · Read the market (0:40–1:10)
**Screen:** In Claude: "Which PONS calls are open, and which is the best value?" → table with strike, premium, premium as % of strike, expiry, and links. Then: "Is NVDA open right now?" → the session warning sentence if it is the weekend.
**VO:** "Fifteen read tools. Offers, prices, charts, positions, staking, the fee proof, launchpad tokens, rewards. Every number comes from the same indexer the website uses, with a link to the row on chain. Stock tokens even carry their trading session: if NVDA is halted or in its weekend hold, the agent says so, and says the quote is the last print."

### Scene 4 · Prepare a trade (1:10–1:45)
**Screen:** "Prepare a covered call on 1000 HMM, 20% above spot, premium 0.0001 ETH, 1 day." Claude asks permission for `prepare_covered_call` (show the prompt). Then the preview and the kyte.sh link. Click it: the Sell form is pre-filled. Wallet popup. Sign.
**VO:** "Six prepare tools. Notice Claude asked before running this one. That's not a Kyte setting, it's the MCP annotation: reads are marked read-only, prepares are not, so every well-behaved client asks. And the result is not a trade. It's a preview and a link. The form is filled in, the numbers are checked against the protocol rules, and the signature is still mine. The server has no key. There is no tool that sends."

### Scene 5 · Autopilot from a sentence (1:45–2:10)
**Screen:** "Sell a covered call on my HMM every week, 20% above spot, 1-day expiry." → `design_strategy` returns the rule in plain English, a 30-day backtest ("would have triggered 4 times"), and the `/autopilot?rule=` link. Open it, sign the free message.
**VO:** "Say a strategy and it becomes a rule: validated, explained, backtested over the last 30 days. I sign a message, no gas. From then on Kyte watches the market and prepares each action for me to sign. Ask `list_strategies` any time and the agent tells you what's waiting."

### Scene 6 · Guardrails and where it's listed (2:10–2:40)
**Screen:** kyte.sh/mcp "Run it under HOL Guard" section; the official MCP Registry search result `sh.kyte/kyte`; `/.well-known/agent-registration.json` (ERC-8004 #22541); the Hermes section.
**VO:** "Put it under HOL Guard and every call gets a policy and a receipt. It's in the official MCP Registry under our own domain, it's ERC-8004 agent 22541 on Robinhood Chain, and it runs inside Hermes, the self-hosted agent, with a cron that posts Autopilot triggers to Telegram. Twenty-one tools, zero that can move funds. kyte.sh/mcp."

**End card:** kyte.sh/mcp · `https://kyte.sh/api/mcp` · github.com/usekyte-org/kyte-mcp · @useKyte · "Options are risky and can expire worthless. Not investment advice."

---

## 3. Hinglish voiceover (same scenes)

1. "Yeh paanch lines asli hain. Har ek ne abhi Kyte ke options market se MCP handshake kiya, live. Ek URL, na account, na key. Dikhata hoon AI isse kya kar sakta hai, aur woh ek cheez jo nahi kar sakta."
2. "URL paste karo, bas yahi setup hai. Claude, ChatGPT, Cursor, Claude Code aur Hermes sab MCP bolte hain, toh ek hi endpoint sab jagah chalta hai. Server stateless hai, na login, na session."
3. "15 read tools: offers, prices, charts, positions, staking, fee proof, launchpad tokens, rewards. Har number wahi indexer deta hai jo website use karti hai, chain ka link ke saath. Stock tokens apna trading session bhi batate hain: NVDA halted ho ya weekend hold mein, agent bolta hai ki quote last print hai."
4. "6 prepare tools. Dekho, Claude ne chalane se pehle poocha. Yeh MCP annotation hai: reads read-only marked hain, prepares nahi, toh har sahi client poochta hai. Aur result trade nahi hai, preview aur link hai. Form bhara hua, numbers protocol rules se check, signature abhi bhi mera. Server ke paas key nahi, bhejne wala tool hai hi nahi."
5. "Strategy bolo aur woh rule ban jata hai: validate, explain, 30 din ka backtest. Main ek message sign karta hoon, gas nahi. Phir Kyte market dekhta hai aur har action mere sign ke liye taiyar karta hai."
6. "HOL Guard ke neeche chalao toh har call pe policy aur receipt. Official MCP Registry mein humare apne domain se listed, Robinhood Chain pe ERC-8004 agent 22541, aur Hermes ke andar bhi chalta hai, Telegram pe Autopilot alerts ke saath. 21 tools, zero jo paisa hila sakein."

---

## 4. Shot list / B-roll

- kyte.sh/mcp hero: wait for all five handshakes, then click one client to re-run it (packets animate).
- Connect tabs: Claude, ChatGPT, Cursor, Claude Code, Hermes (copy button click).
- claude.ai connector settings with the URL pasted.
- A Claude chat: the PONS offers table; the NVDA session warning (record on a weekend for the "held" state, or on a halt).
- The permission prompt for `prepare_covered_call` (this is the money shot for the safety story).
- kyte.sh/sell opened from the link, pre-filled; wallet popup (hide balances you don't want public).
- Blockscout: the `createOffer` transaction after signing.
- `design_strategy` output with the backtest line; kyte.sh/autopilot with the rule and the signed badge.
- Tools section of kyte.sh/mcp: the 21 cards, "read-only" vs "prepares" pills.
- Terminal: `curl` of `tools/list` returning 21 tools (proves stateless: no session header).
- registry.modelcontextprotocol.io search "kyte"; hol.org registry page; `/.well-known/agent-registration.json`.
- The Hermes ASCII section and a Telegram trigger line (from the Hermes video).

## 5. Captions / post text

**X (short):** Kyte's options market is one URL away from any AI app. 21 MCP tools, 15 read, 6 prepare, 0 that can sign. Works in Claude, ChatGPT, Cursor, Claude Code and Hermes. Listed in the official MCP Registry as sh.kyte/kyte. No account, no key. kyte.sh/mcp

**YouTube description:** Kyte is a non-custodial, fully collateralised options market on Robinhood Chain. This video shows its MCP server: connecting it to Claude in 20 seconds, reading live offers and stock-token session states, preparing a covered call that the user signs in their own wallet, turning a sentence into an Autopilot rule, and the guardrails: read-only annotations, HOL Guard, the official MCP Registry listing and ERC-8004 identity. Nothing here can sign or send; every action is a link you sign yourself. Options are risky and can expire worthless. Not investment advice. Kyte is not affiliated with Robinhood.

## 6. Before recording

- Make sure at least one PONS or HMM offer is open so `find_offers` returns rows (write one from a second wallet if the book is empty).
- Hold one position in the demo wallet so `explain_my_positions` has something to show.
- Have an Autopilot rule signed in advance for Scene 5's badge, but record `design_strategy` live.
- Record Scene 4's permission prompt in claude.ai, it is the clearest visual of "reads flow, prepares ask".
- If the Hermes catalog or DefiLlama PRs are merged by then, add one line in Scene 6; otherwise keep "submitted".
