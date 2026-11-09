# Video: Kyte inside Hermes Agent

Purpose: a 2–3 minute explainer or demo for X / YouTube. Everything below is true as of 9 Nov 2026 and verified against production. Numbers in brackets are what the screen shows today; re-check them on the day of recording.

Audience: people who run their own AI agent (Hermes, Claude, Cursor) and hold tokens on Robinhood Chain.

One-line pitch: **"Your own agent, on your own machine, trading options on Robinhood Chain for you to sign. Kyte never sees a key."**

---

## 0. Facts you can say on camera

| Claim | True? | Source |
|---|---|---|
| Hermes Agent is open source (MIT) from Nous Research, runs on a laptop or a $5 VPS, talks to you on Telegram, Discord, Slack, WhatsApp, Signal | Yes | github.com/NousResearch/hermes-agent |
| Kyte has a public MCP server at `https://kyte.sh/api/mcp`, no account, no key | Yes | kyte.sh/mcp |
| It exposes 21 tools: 15 read, 6 prepare | Yes | live handshake on kyte.sh/mcp |
| No tool can sign, send, spend or read a key. Prepare tools return a kyte.sh link; the user signs in their own wallet | Yes | `src/lib/agent/tools.ts`, MCP route annotations |
| Two Hermes skills are published: `kyte-options`, `kyte-autopilot-watch` | Yes | github.com/usekyte-org/hermes-kyte |
| A Hermes cron job can push Autopilot triggers to Telegram every 15 minutes | Yes | README of the tap; uses read-only `list_strategies` |
| Kyte is ERC-8004 agent #22541 on Robinhood Chain | Yes | public/.well-known/agent-registration.json |
| Hermes marketplace listing | **Not yet** (submission pending) | do not claim it |

Do not say: "Hermes trades for you", "automated trading", "the bot buys". Say: "prepares", "ready to sign", "you sign".

---

## 1. Script (English, ~2:30)

### Scene 1 · Hook (0:00–0:12)
**Screen:** kyte.sh/mcp, scroll to the ASCII "KYTE × HERMES" card; let the terminal type.
**VO:** "This is an AI agent running on my own laptop. It just found a covered call for me on Robinhood Chain and sent me the link on Telegram. It can't sign anything. That part is still mine."

### Scene 2 · What Hermes is (0:12–0:35)
**Screen:** Hermes GitHub README, then a terminal with `hermes` running.
**VO:** "Hermes Agent is Nous Research's open-source agent. You install it, pick any model you like, and talk to it from Telegram or Discord. It has a built-in MCP client, so any MCP server becomes a set of tools it can call."

### Scene 3 · Connect Kyte (0:35–1:05)
**Screen:** `~/.hermes/config.yaml`, paste the block; run `/reload-mcp`; show `mcp_kyte_*` tools listed.
**On-screen text:**
```yaml
mcp_servers:
  kyte:
    url: "https://kyte.sh/api/mcp"
    trust: untrusted
```
**VO:** "One block in the config. No API key, no account. Hermes reloads and sees twenty-one Kyte tools. The fifteen read tools run without asking. The six prepare tools ask me once, because they're marked as not read-only. That's the whole permission model, and it's honest."

### Scene 4 · Skills (1:05–1:25)
**Screen:** `hermes skills tap add usekyte-org/hermes-kyte`, then `hermes skills install kyte-options kyte-autopilot-watch`.
**VO:** "Two skills from our tap. `kyte-options` teaches the agent the market: what a covered call locks, what a cash-secured put promises, and the rule that every number comes from the tools, never from memory. `kyte-autopilot-watch` is a cron job."

### Scene 5 · Ask it something (1:25–1:50)
**Screen:** Telegram chat with the Hermes bot. Type: "which PONS calls are open, and which is the best value?" Show the table it returns with strikes, premiums, expiry.
Then: "prepare a covered call on 1000 HMM, 20% above spot, premium 0.0001 ETH, 1 day". Show the preview and the kyte.sh link.
**VO:** "I ask in plain language. It reads live offers from the same indexer the site uses. When I ask it to prepare a trade, I get a preview and a link. The link opens the Kyte sell form pre-filled. I check the numbers and sign in my wallet. Nothing happened until I did."

### Scene 6 · Autopilot in Telegram (1:50–2:15)
**Screen:** kyte.sh/autopilot, a signed rule ("sell a covered call on HMM every week, 20% above spot"). Then the cron command:
```
hermes cron create "every 15m" \
  "Check Kyte Autopilot for wallet 0xYOUR… with the kyte-autopilot-watch skill. Report new triggers, otherwise reply [SILENT]." \
  --skill kyte-autopilot-watch --deliver telegram
```
Then a Telegram message: "▲ Kyte Autopilot · covered call · 1000 HMM · … · review and sign: kyte.sh/sell?…"
**VO:** "Autopilot is a rule you sign once. Kyte watches the market and prepares each action when the rule fires. Until now you had to open the page to see it. Now Hermes checks every fifteen minutes and posts the ready-to-sign link to my chat. Nothing new, nothing sent."

### Scene 7 · Why this matters (2:15–2:30)
**Screen:** kyte.sh/mcp connection map, five clients, "5/5 connected".
**VO:** "Same server, five clients: Claude, ChatGPT, Cursor, Claude Code and Hermes. Your agent, your model, your machine. Kyte stays non-custodial. Link in the description."

**End card:** kyte.sh/mcp · github.com/usekyte-org/hermes-kyte · @useKyte

---

## 2. Hinglish voiceover (same scenes)

1. "Yeh AI agent mere apne laptop pe chal raha hai. Isne abhi Robinhood Chain pe mere liye ek covered call dhundi aur Telegram pe link bheja. Sign yeh nahi kar sakta. Woh kaam mera hai."
2. "Hermes Agent Nous Research ka open-source agent hai. Install karo, apna model chuno, Telegram ya Discord se baat karo. Isme MCP client built-in hai, toh koi bhi MCP server iske tools ban jaate hain."
3. "Config mein ek block. Na API key, na account. Hermes ko 21 Kyte tools dikhte hain. 15 read tools bina pooche chalte hain, 6 prepare tools ek baar poochte hain. Bas yahi permission model hai."
4. "Humare tap se do skills. `kyte-options` agent ko market sikhati hai aur rule deti hai ki har number tool se aayega, yaad se nahi. `kyte-autopilot-watch` ek cron job hai."
5. "Main seedha pooch leta hoon. Yeh live offers padhta hai. Trade prepare karne ko bolo toh preview aur link milta hai. Link Kyte ka sell form pre-filled kholta hai. Main numbers check karke wallet mein sign karta hoon. Tab tak kuch nahi hua."
6. "Autopilot ek rule hai jo aap ek baar sign karte ho. Kyte market dekhta hai aur rule fire hone pe action prepare karta hai. Ab Hermes har 15 minute check karke ready-to-sign link Telegram pe bhej deta hai."
7. "Ek server, paanch clients. Aapka agent, aapka model, aapki machine. Kyte non-custodial rehta hai."

---

## 3. Shot list / B-roll

- kyte.sh/mcp hero: connection map lighting up one client at a time (it runs a real handshake; wait for all five).
- The ASCII card: hover the pointer over it so the glyph field reacts; let the banner decode once (hover again to replay).
- Terminal: `hermes` TUI with the `/reload-mcp` output listing `mcp_kyte_*`.
- Telegram: the two prompts from Scene 5 and the Autopilot line from Scene 6.
- kyte.sh/sell opened from the link, form pre-filled, wallet popup (do not show the seed phrase or balances you don't want public).
- Blockscout: the resulting `createOffer` transaction, if you sign one on camera.
- GitHub: usekyte-org/hermes-kyte README.

## 4. Captions / post text

**X (short):** Your own agent, your own machine, options on Robinhood Chain. Kyte now runs inside @NousResearch Hermes Agent: 21 tools over MCP, two skills, and a cron that pushes Autopilot's ready-to-sign trades to Telegram. No keys, no account. kyte.sh/mcp

**YouTube description:** Kyte is a non-custodial, fully collateralised options market on Robinhood Chain. In this video: adding the Kyte MCP server to Hermes Agent, installing the kyte-options and kyte-autopilot-watch skills, asking for the best open calls, preparing a covered call, and getting Autopilot triggers delivered to Telegram. Nothing here can sign or send; every action is a link you sign in your own wallet. Options are risky and can expire worthless. Not investment advice. Kyte is not affiliated with Robinhood.

## 5. Before recording

- Make sure a wallet you control has one Autopilot rule with a waiting trigger, or the Telegram scene has nothing to show.
- Use a wallet address you are fine showing. Never show `~/.hermes/.env`.
- Re-run the kyte.sh/mcp handshake on camera; the tool count is read live.
- If the Hermes marketplace listing is approved by then, add one line in Scene 4: "or install it from the Hermes marketplace".
