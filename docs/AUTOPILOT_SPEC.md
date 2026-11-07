# Kyte Autopilot: specification

**Goal.** Let a user hand Kyte a strategy in plain language ("sell weekly covered calls on my PONS 20% above spot",
"exercise anything in the money two hours before expiry", "buy cheap NVDA calls up to 0.05 ETH a week") and have it
carried out without the user watching the market, while Kyte stays non-custodial and the AI never signs.

**The rule.** Authority never goes to the model. It goes to rules the user signs. The agent designs the rule, the user
signs it, a keeper executes it mechanically when on-chain conditions hold, the agent watches and reports.

## Two modes

| | Watch and prepare (mode A, shipping first) | Vault (mode B, phase 1 to 4) |
|---|---|---|
| Who executes | The user, by clicking a prepared link and signing | A keeper, through the AutopilotVault contract |
| Custody change | None | Funds for strategies sit in the vault, movable only per the user's rules or back to the user |
| New contracts | None | AutopilotVault |
| Needs audit | No | Yes |
| Latency | As fast as the user reacts to the notification | Seconds after the condition holds |
| Use | Validates demand and the rule language | The real product |

Both modes share the rule schema below, the agent tools and the Autopilot page. Mode A rules become mode B rules by
depositing collateral; the user experience is the same card.

## Rule schema (shared)

```json
{
  "type": "list_call | list_put | buy_call | buy_put | exercise | cancel_unfilled",
  "token": "PONS",
  "params": { ... per type ... },
  "schedule": { "repeat": true, "until": 1797000000, "maxRuns": 52, "cooldownSec": 3600 },
  "limits": { "maxExposureTokens": 10000, "maxPremiumEthPerDay": 0.05, "maxTotalRiskEth": 0.5, "stopDrawdownPct": 30 }
}
```

| Type | Params | Condition to trigger | Action |
|---|---|---|---|
| `list_call` | `amount`, `strikePctAboveSpot`, `minPremiumEth`, `expirySec`, `fillWindowSec` | the user has no open call offer on the token | list a covered call at `spot × (1 + pct)`, premium = max(hint, minPremium) |
| `list_put` | `amount`, `strikePctBelowSpot`, `minPremiumEth`, `expirySec`, `fillWindowSec` | no open put offer on the token, puts enabled | list a cash-secured put at `spot × (1 − pct)` |
| `buy_call` / `buy_put` | `maxPremiumOverStrike`, `maxStrikeVsSpotPct`, `maxPremiumEth`, `minHoursToExpiry` | an open offer matches every filter and the daily budget allows | buy that offer |
| `exercise` | `marginPct`, `minHoursBeforeExpiry`, `maxHoursBeforeExpiry` | a held option is in the money by `marginPct` inside the time window | exercise it |
| `cancel_unfilled` | `afterHours` | an open offer by the user is older than `afterHours` | cancel it and reclaim collateral |

Prices for conditions: in mode A the indexer price (Uniswap v4 swaps or Robinhood quotes). In mode B the on-chain
TWAP from a per-pool hook, never a value the model produced.

## Mode A: watch and prepare

- **Storage**: the indexer's SQLite gets `autopilot_rules` and `autopilot_triggers`.
- **Auth**: a rule is created or deleted with a wallet signature over `Kyte Autopilot\n<action>\n<address>\n<timestamp>\n<rule hash>`. The indexer verifies it (EOA and EIP-1271 through the public client). Timestamps older than 10 minutes are rejected. No session, no cookies.
- **Evaluation**: every 60 seconds the indexer walks active rules, builds the data each needs from its own tables, and writes a trigger when the condition holds. A trigger carries the label, the preview text and the prepared kyte.sh link, exactly like the agent's prepare tools. One trigger per rule and target (offer id or position id) until that target changes state.
- **Delivery**: the Autopilot page lists triggers newest first with a Review and sign button; the agent lists them when asked ("what is waiting for me"); the Ask Kyte button shows a count badge when unseen triggers exist.
- **Agent tools**: `design_strategy` (intent to a validated rule with a plain-language preview and a backtest summary over recent candles), `prepare_strategy` (link to the Autopilot page with the rule pre-filled for signing), `list_strategies`, `list_triggers`, `prepare_pause_strategy`.
- **Limits**: 20 rules per address, 60 second evaluation, rules expire at `schedule.until` or after `maxRuns` triggers.

## Mode B: AutopilotVault

- **One contract, per-user accounts.** `deposit(token, amount)`, `depositWeth`, `withdraw`, `addRule(bytes)`, `cancelRule(id)`, `pause()`, `resume()`. Withdraw, cancel and pause always work, with no delay, for the owner only.
- **`execute(user, ruleId)`** is permissionless. It re-checks every condition on chain (TWAP, time, budget, limits), reverts otherwise, and pays the caller a gas bounty from the user's deposit (capped per execution, set by the user).
- **Actions** call the existing markets and router on behalf of the vault account: `createOffer` with the vault as seller, `buy` with the vault as holder, `exercise`, `cancelUnfilled`. Proceeds and returned collateral land in the account, withdrawable any time.
- **Risk limits** live on chain: exposure per token, premium budget per day, total risk, drawdown stop measured against the account's deposit value in ETH terms from the TWAP. Tripping the drawdown stop cancels all rules and pauses the account.
- **Governance**: timelock sets the bounty cap and the allowed markets; guardian can pause execution protocol-wide (never withdrawals).
- **Price**: `KyteHook` style TWAP per pool. Tokens without a pool hook cannot have mode B rules until one exists.
- **Keeper**: the existing bot gets a rule loop: read active rules from the indexer, simulate `execute`, send only when it succeeds, alert on repeated reverts.
- **Audit** before mainnet; launch with small caps per account.

## Phases

| # | Deliverable | Effort |
|---|---|---|
| A | Watch and prepare: indexer rules and triggers, signed API, evaluator, Autopilot page, agent tools, badge | 3 days |
| 1 | AutopilotVault contract, rule encoding, tests, fork tests | 2 weeks |
| 2 | Keeper rule loop, indexer tables and routes for vault rules and executions | 1 week |
| 3 | Agent tools and Autopilot page for vault mode, backtest view, deposit and withdraw flows | 1.5 weeks |
| 4 | Audit, timelock deploy, launch with caps | audit time plus 1 week |

## Decisions still open

1. v1 rule types for the vault: all six, or covered calls and exercise first.
2. Per-pool TWAP source for tokens other than $KYTE.
3. Gas: bounty from the user's deposit, or Kyte-run keeper at launch.
4. Audit budget and timing.

## Non-negotiables

- The model never holds a key, never signs, never executes. It designs and explains.
- Every condition the keeper acts on is checked on chain at execution time.
- The user can always withdraw, cancel and pause, instantly, without anyone's permission.
- Information, not advice: the user sets every price and size; the agent shows numbers and backtests.
