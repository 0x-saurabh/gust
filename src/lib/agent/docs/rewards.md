# USDG rewards

Kyte pays a pool of USDG (Paxos Global Dollar, 6 decimals) every 24 hour epoch to the wallets that traded, split by
the protocol fees they actually paid. Fees are the only input, so there is nothing to farm for free: a wash trade costs
its full fee.

## Points, per epoch (`block.timestamp / 1 day`, the protocol epoch)

- Buy an option: 1 point per 0.0001 ETH of the fee on the premium (3% of the premium).
- Write an option that fills: the same points as its buyer.
- Write a cash-secured put on a stock token (Robinhood Stock Token): 1.5x for the writer.
- Hold a position (as holder or writer) through an epoch end: 0.2x its premium fee, every epoch it stays open.

The epoch's pool splits pro rata by points. Shares below 0.01 USDG are not paid. The pool per epoch is set by the ops
Safe (it can change or be 0); when it is 0 the epoch is still scored and paid later if a pool is set for it.

## Claiming

Ten minutes after an epoch ends the indexer scores it and builds a Merkle tree (OpenZeppelin StandardMerkleTree,
leaf = (epoch, account, amount)). The keeper publishes the root to `UsdgRewards` once the contract holds enough unowed
USDG. Anyone can then submit a claim; the USDG always goes to the account in the leaf. Claims stay open 90 days after
publication, then the unclaimed part returns to the budget. Claims can never be paused. The whole tree for any epoch is
public at `/api/indexer/rewards/epoch/<n>`; a wallet's standing at `/api/indexer/rewards/<address>`.

Tool: `get_rewards(address?)`. Page: kyte.sh/rewards.
