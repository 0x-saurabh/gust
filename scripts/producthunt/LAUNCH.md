# Kyte on Product Hunt: submission kit

Paste these into the Product Hunt form field by field. Character limits are Product Hunt's.

## Step 1: link
`https://kyte.sh`

## Main info

**Name:** Kyte

**Tagline (60 chars max):**
`Covered options on Robinhood Chain. No margin, no liquidations.`
(63 chars; if rejected use: `On-chain options on Robinhood Chain, fully collateralised`)

**Description (260 chars max):**
Kyte is a non-custodial options market on Robinhood Chain. Sell covered calls or cash-secured puts, or buy them as transferable NFTs. Every option is backed 1:1 on-chain, settles at the seller's strike, and any AI agent can trade it through the Kyte MCP server.

**Links:** website https://kyte.sh · X https://x.com/useKyte · docs https://kyte.sh/docs · MCP https://kyte.sh/mcp · GitHub https://github.com/usekyte-org/kyte-mcp

**Topics (pick 3):** Crypto, Fintech, Artificial Intelligence. (Alternatives: Developer Tools, Investing.)

**Pricing:** Free. (Protocol fee 3% of premium, 0.1% of strike on exercise; no subscription.)

**Launch tags / "Built with":** Robinhood Chain, Uniswap v4, Next.js, Foundry, Claude (MCP)

## Images

Logo: `scripts/producthunt/logo-480.png` (480x480, PH needs 240x240 minimum).
Gallery (1270x760 each, live captures of kyte.sh), upload in this order:
1. `gallery/01-hero.jpg` landing hero
2. `gallery/02-market.jpg` market: live Uniswap v4 price with every option trade on the chart
3. `gallery/03-sell.jpg` sell a covered call: strike on the chart, fee summary
4. `gallery/04-trades.jpg` every trade on-chain, newest first
5. `gallery/05-mcp.jpg` Kyte inside any AI app: Claude, ChatGPT, Cursor, Claude Code
6. `gallery/06-claude.jpg` Claude answering with live Kyte data
7. `gallery/07-launchpad.jpg` Pons launchpad tokens listed on Kyte
8. `gallery/08-stake.jpg` $KYTE staking, 30% of fees
9. `gallery/09-proof.jpg` every fee and burn on the record
10. `gallery/10-docs.jpg` docs
Product Hunt shows the first 3 to 5 prominently; the rest are fine to include. Re-capture with
`scripts/producthunt/capture.sh` after UI changes (needs Chrome).

Optional video: a 30-60 s screen recording of selling a covered call and Claude finding it. PH embeds YouTube or Loom.

## First comment (maker comment, post the moment the launch goes live)

Hi Product Hunt, I'm Saurabh, founder of Kyte.

Kyte is an options market where nothing is ever under-collateralised. If you sell a covered call, your tokens sit in the contract until the option is exercised, expires or you cancel. If you sell a cash-secured put, the strike sits there in WETH. Buyers pay a premium in ETH and get an NFT they can hold, transfer or exercise. No oracle decides the outcome, no margin engine, no liquidations.

Why Robinhood Chain: the tokens people actually hold there (PONS launchpad tokens, LINK, PENGU, VIRTUAL, cbBTC and more) had no way to earn yield or hedge. Kyte lists them through a registry with per-token caps and minimum strikes.

What's new for this launch:
• Agents can trade it. The Kyte MCP server (kyte.sh/api/mcp) gives Claude, Cursor or ChatGPT 20 tools: find offers, compare, explain, prepare a trade. The agent never holds keys; you sign in your own wallet.
• Oak Agent Kit recipes: `oak recipes add kyte-oak-recipes` gives any Oak agent the same markets from its own wallet.
• Listed on the HOL registry and Anthropic connector-style setups, DefiLlama adapter in review.
• Autopilot: describe a strategy in plain English, sign it once, it runs on your schedule.

Fees are 3% of the premium and 0.1% of the strike on exercise, split to $KYTE stakers and buybacks on-chain, with the proof published.

Options can expire worthless; this is not financial advice. I'll be here all day for questions, especially the hard ones about the contracts.

## Launch-day checklist

- Schedule for 12:01 AM Pacific on a Tuesday, Wednesday or Thursday; the listing ranks over the following 24 h.
- Maker profile: real name, photo, X and LinkedIn linked. Add a second maker only if that person has a real PH account.
- Pre-write the X post and a thread; link the PH page, ask for honest comments, do not ask for upvotes in public.
- Reply to every comment within an hour for the first 12 hours.
- Have kyte.sh/market show at least a few open offers on launch day (seed PONS and KYTE offers beforehand).
- After launch: add the PH badge to the site footer, post the result on X and LinkedIn.
