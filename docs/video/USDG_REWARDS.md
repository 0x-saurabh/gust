# Video: USDG rewards on Kyte

Purpose: a 2–3 minute explainer for X / YouTube. Status as of 9 Nov 2026, verified against the code, the chain and the live indexer. **Read section 0 first: the program is live for scoring but has not paid anyone yet.** Record either (a) after the pool is funded, or (b) as a "how it works, payouts start when we fund the pool" video. Do not imply people have already been paid.

Audience: traders on Robinhood Chain, $KYTE stakers, people deciding whether to write their first option.

One-line pitch: **"Every option you buy or write on Kyte earns a share of a daily USDG pool, scored by the fees you actually paid. Claims are signed in your wallet and never pause."**

---

## 0. Real status (say only what is true)

| Item | Status today | Evidence |
|---|---|---|
| Points scored every 24h epoch, live on kyte.sh/rewards | **Live** | indexer `/rewards`: 5 final epochs, 2–6 participants each |
| `UsdgRewards` contract deployed on Robinhood Chain | **Live**, `0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956` | `contracts/deployments/4663.json` |
| Publisher set to the live keeper | **Done** (on-chain `publisher()` is the keeper) | `scripts/mainnet/usdg-rewards-publisher-plan.mjs` executed |
| Keeper job that publishes roots and sweeps expired epochs | **Running**, skips epochs with a 0 pool | `keeper/src/index.mjs` `jobRewards` |
| MCP / Ask Kyte tool `get_rewards` | **Live** | kyte.sh/mcp, 21 tools |
| Pool size decided | **No** (`REWARDS_POOL_USDG=0`) | `render.yaml` |
| Contract funded with USDG | **No** (balance 0) | on-chain read |
| Any epoch paid out | **No** | `/rewards`: every epoch `totalUsdg 0` |
| Separate "staker USDG share" (daily USDG to $KYTE stakers from Pons creator rewards) | **Built, switched off** (payer not set, pool 0) | `docs/STAKER_USDG_SHARE.md` |

Proposal on the table (not final): 2,000 USDG a week (about 285 USDG per epoch) for 8 weeks from treasury, plus 25% of protocol fees swapped to USDG. Say "proposed" if you mention numbers.

Do not say: "earn yield", "APY", "guaranteed", "airdrop", "farm". Say: "rewards for fees paid", "a share of the pool", "claim".

---

## 1. How it works (the part that stays true)

- **Epoch:** 24 hours, same clock as the fee vault. Scored 10 minutes after it ends.
- **Buy an option:** 1 point per 0.0001 ETH of the premium fee you paid.
- **Write an option that fills:** the same points as the buyer.
- **Write a cash-secured put on a stock token:** 1.5× for the writer. (Stock tokens are the ones with a Harmonic session state.)
- **Keep a position open across an epoch end:** 0.2× its fee-points, every epoch, for both sides. No new fee is counted.
- **Pool split:** pro rata by points. Shares under 0.01 USDG are dropped.
- **Payout:** the keeper publishes a Merkle root per epoch. You claim on kyte.sh/rewards, signed in your wallet. Anyone can claim for any account. Claims never pause and stay open 90 days. After that, unclaimed USDG is swept back.
- **Safety:** the guardian or timelock can revoke a root before anyone claims it (a wrong root can be fixed), but can never freeze claims. The timelock can only withdraw USDG that is not owed.
- **Sybil:** points come from fees paid on chain, so a wash trade costs the full fee. The contracts refuse self-trades.
- **Transparency:** every epoch's tree is public at `kyte.sh/api/indexer/rewards/epoch/<n>`.

### The second program, in one breath
"Staker USDG share" is different: $KYTE stakers get a daily USDG transfer straight to their wallet, funded by Kyte's Pons creator rewards. No claim, no contract. Hidden floor and cap per wallet. It is built and will switch on when the payout wallet is funded. Mention it only if asked; do not mix the two on screen.

---

## 2. Script (English, ~2:30)

### Scene 1 · Hook (0:00–0:12)
**Screen:** kyte.sh/rewards, the four tiles (This epoch's pool · Your points · Estimated · Claimable).
**VO:** "Every option on Kyte pays a fee. From now on that fee earns you points, and the points split a daily pool of USDG. Here's exactly how it's scored, because every number is public."

### Scene 2 · What counts (0:12–0:50)
**Screen:** the "How points work" card on kyte.sh/rewards; highlight each line as you say it.
**VO:** "Buy an option: one point per 0.0001 ETH of fee. Write one that fills: the same points as the buyer. Write a cash-secured put on a stock token like NVDA or AAPL: one and a half times. Keep a position open through the end of a day: a fifth of its points again, every day it stays open. That's it. No referral codes, no tasks, no retweets. Fees paid, on chain."

### Scene 3 · The pool and the split (0:50–1:15)
**Screen:** "Recent epochs" table (date · wallets · points · final). Then a Blockscout tab on the `UsdgRewards` contract.
**VO:** "Each day is an epoch. Ten minutes after it ends, the indexer scores it and the pool is split by points. The keeper publishes a Merkle root to this contract. It can publish once per epoch and only if the contract already holds the USDG. It can never touch your claim."

### Scene 4 · Claiming (1:15–1:40)
**Screen:** kyte.sh/rewards with a connected wallet; press Claim; wallet popup; USDG balance ticks up. *(Only possible after funding. Otherwise show the "Claimable now" tile and the 90-day rule as text.)*
**VO:** "When a root is live, your share shows as claimable. One signature, the USDG lands in your wallet. Claims stay open ninety days and nobody can pause them. If a root is ever wrong, it can be revoked before anyone claims, and that's the only lever we hold."

### Scene 5 · Why fees, not volume (1:40–2:05)
**Screen:** kyte.sh/proof fee splits; then the Ask Kyte panel answering "how are USDG rewards scored?" via `get_rewards`.
**VO:** "We score fees, not notional. A wash trade costs the full fee, so farming it just funds everyone else's pool. The rules live in the indexer, the trees are public at a URL, and the agent can read them: ask Kyte and it tells you your points this epoch."

### Scene 6 · Status and call to action (2:05–2:30)
**Screen:** the "Program" card (Token USDG · Contract · Funded · Scored epochs).
**VO (choose one):**
- *If funded:* "The pool is live at [X] USDG per epoch. Open calls and puts are on kyte.sh/market. Write one, keep it open, claim tomorrow."
- *If not yet funded:* "Scoring is already running, you can see your points today. Payouts start when the pool is funded; we'll announce the first epoch. Until then, every option you write is already being counted."

**End card:** kyte.sh/rewards · contract 0xAd56…2956 · @useKyte · "Options are risky and can expire worthless. Not investment advice."

---

## 3. Hinglish voiceover (same scenes)

1. "Kyte pe har option ek fee deti hai. Ab wahi fee aapko points deti hai, aur points se roz ka USDG pool batata hai. Har number public hai."
2. "Option kharido: 0.0001 ETH fee par ek point. Option likho jo fill ho: buyer jitne points. Stock token pe cash-secured put likho: dedh guna. Position din ke end tak khuli rakho: uske points ka paanchva hissa roz. Bas. Na referral, na task, na retweet. Sirf on-chain fee."
3. "Har din ek epoch. Khatam hone ke 10 minute baad score hota hai aur pool points se batata hai. Keeper is contract pe Merkle root publish karta hai. Ek epoch mein ek baar, aur tabhi jab contract mein USDG pehle se ho. Aapke claim ko woh chhoo nahi sakta."
4. "Root live hote hi aapka hissa claimable dikhta hai. Ek signature, USDG wallet mein. Claim 90 din khule rehte hain aur koi pause nahi kar sakta."
5. "Hum fees score karte hain, volume nahi. Wash trade ki poori fee lagti hai, toh farming se doosron ka pool bharta hai. Rules indexer mein hain, trees public URL pe, aur Ask Kyte aapke points bata deta hai."
6. *(funded)* "Pool live hai, [X] USDG har epoch. kyte.sh/market pe option likho, khula rakho, kal claim karo." / *(not funded)* "Scoring abhi se chal rahi hai, points aaj dikhte hain. Payout pool fund hote hi shuru hoga, pehla epoch announce karenge."

---

## 4. Shot list / B-roll

- kyte.sh/rewards tiles and the "How points work" card (hover each line).
- "Recent epochs" table scrolling.
- Blockscout: `UsdgRewards` 0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956, `publisher()` read, USDG balance.
- `kyte.sh/api/indexer/rewards/epoch/<n>` JSON in a browser tab (the public tree).
- kyte.sh/market → sell a covered call or cash-secured put (the action that earns points).
- Ask Kyte: "how many points do I have this epoch?"

## 5. Captions / post text

**X (short):** Options on Kyte now earn USDG. Points = fees you paid on chain: buy 1×, write 1×, cash-secured put on a stock token 1.5×, keep it open 0.2×/day. Daily pool, Merkle claim, never pauses, trees public. kyte.sh/rewards

**YouTube description:** How Kyte's USDG trading rewards work: 24-hour epochs scored from the fees you actually paid, a daily USDG pool split pro rata, Merkle roots published by the keeper to the UsdgRewards contract on Robinhood Chain, and claims you sign in your own wallet with no pause switch. Every epoch's tree is public at kyte.sh/api/indexer/rewards/epoch/<n>. Options are risky and can expire worthless. Not investment advice. Kyte is not affiliated with Robinhood.

## 6. Before recording

1. Decide the pool: set `REWARDS_POOL_USDG` on the indexer (Render) and fund the contract from the ops Safe. The keeper then publishes the next final epoch within an hour.
2. Confirm on Blockscout that `publisher()` is the keeper and the USDG balance covers the pool.
3. Trade from a wallet you can show so the Claim scene is real.
4. Update `docs/USDG_REWARDS_IMPLEMENTATION.md` (it still says "not yet deployed").
5. If the staker USDG share is also switched on by then, record it as a separate 30-second clip, not in this video.
