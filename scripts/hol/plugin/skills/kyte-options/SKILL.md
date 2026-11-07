---
name: kyte-options
description: Use the Kyte MCP server to read the Kyte options market on Robinhood Chain and prepare trades the user signs themselves. Use when the user asks about Kyte markets, open calls or puts, option prices, their Kyte positions, staking, the fee proof, or Pons launchpad tokens listed on Kyte.
---

# Kyte options market

Kyte is a non-custodial, fully collateralised options market on Robinhood Chain. The `kyte` MCP server is read-only:
it never holds keys and never sends a transaction.

## Reading

- `list_tokens`, `get_prices`, `get_chart`: what can be traded and where it is priced.
- `find_offers`, `get_offer`, `explain_offer`, `compare_offers`: open calls and puts, with breakeven and payoff.
- `get_positions`, `get_staking`: a wallet's holdings and stake (pass the public address).
- `get_protocol_stats`, `get_proof`, `get_activity`: volume, fee splits, buyback burns, recent events.
- `list_graduated`: Pons launchpad tokens that graduated and whether Kyte lists them. Options on Pons tokens expire
  within 24 hours.

## Preparing a trade

`prepare_buy`, `prepare_covered_call`, `prepare_cash_secured_put`, `prepare_exercise` and `prepare_stake` validate the
inputs and return a preview plus a kyte.sh link. Give the user the link; they review the numbers and sign in their own
wallet. Never present a prepared trade as done.

## Rules

- Every number comes from the tools. Do not estimate prices or fees.
- Ask for any amount, strike, premium or expiry the user has not given.
- Options are risky and can expire worthless. This is information, not financial advice.
