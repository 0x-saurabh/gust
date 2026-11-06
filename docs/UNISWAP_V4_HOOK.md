# Kyte × Uniswap v4 Hook: Video Script Doc

> Source files: `contracts/src/hooks/KyteHook.sol`, `contracts/script/HookDeployer.sol`,
> `contracts/src/adapters/UniswapV4Adapter.sol`, `contracts/script/Deploy.s.sol`
> Chain: Robinhood Chain (mainnet 4663, testnet 46630) · Uniswap v4 PoolManager: `0x8366a39CC670B4001A1121B8F6A443A643e40951`

---

## 1. One-line summary (the video hook)

**KyteHook is a Uniswap v4 hook that does two jobs on every swap in the `$KYTE/WETH` pool:**

1. **Protocol fee:** it takes 0.10% (10 bps) of each swap in WETH and sends it straight to the `FeeVault`.
2. **TWAP price oracle:** it records the price after every swap, so the buyback never trades against a manipulated price.

No middleman wallet. No team wallet ever touches the fee. Everything is on-chain.

---

## 1b. The hook's role in Kyte, explained simply

Think of the hook as **a small toll booth and a price camera built into the `$KYTE/WETH` pool**.

Kyte is an options market. It earns WETH fees from option trades, and those fees feed stakers and a `$KYTE` buyback-and-burn. The hook adds two more things to that system:

| Without the hook | With KyteHook |
|---|---|
| The pool is a plain Uniswap pool. Nobody on Kyte earns from trades in it. | Every eligible swap sends a small WETH fee to the `FeeVault`, so pool trading volume also feeds stakers and burns. |
| The buyback would have to trust the live (spot) price, which can be manipulated in one block. | The hook records the price history, so the buyback uses a 10-minute average that one block cannot move. |

### How it works, step by step

1. **Setup (once).** The hook is deployed at a specially mined address, then the `$KYTE/WETH` pool is created with that hook attached. On creation, the hook records the first price (`afterInitialize`).
2. **Someone swaps.** A trader swaps in the pool. The PoolManager runs the swap as normal.
3. **The PoolManager calls the hook.** Right after the swap it calls `afterSwap`. Only the PoolManager is allowed to call it.
4. **The hook does two things:**
   - **Price camera:** it saves the pool's current price (tick) with a timestamp in a 128-slot history.
   - **Toll booth:** if the swap's unspecified side is WETH, it calculates 0.10% of that WETH and uses `poolManager.take(...)` to send it straight to the `FeeVault`.
5. **The vault splits the money.** Once per epoch anyone can call `FeeVault.split()`: **30%** goes to `$KYTE` stakers, **20%** goes to the `BuybackBurner`, **50%** goes to ops.
6. **The buyback is protected.** When the `BuybackBurner` buys `$KYTE`, the adapter asks the hook for the 10-minute average price. The buy must stay within slippage of that price, and the bought `$KYTE` is burned. If the oracle can't answer, the buy reverts instead of falling back to spot.

### A worked example

- Pool fee is 10 bps. A trader sells 1,000 `$KYTE` and the pool pays out about 1 WETH.
- The unspecified side is the WETH output, so the hook takes 0.10% of it: **0.001 WETH**, sent to the `FeeVault`.
- At the end of the epoch that 0.001 WETH is split: 0.0003 WETH to stakers, 0.0002 WETH to buyback-and-burn, 0.0005 WETH to ops.
- The `HookFee` event is logged on-chain, and the site's Proof page reads it.

> **Note on which swaps pay the fee:** the fee is only taken when the unspecified side is WETH. A swap that sells `$KYTE` for WETH, or that asks for an exact WETH amount, pays it. A swap that buys `$KYTE` with an exact WETH input does not pay the hook fee, because there the unspecified side is `$KYTE`. This is by design (`feeCurrencyOnly = WETH`), so the vault only ever receives WETH it can split.

### What the hook does NOT do

- It does not hold funds. Fees go straight to the vault in the same transaction.
- It does not block, pause or reroute swaps. It only runs after them.
- It cannot be changed by the team alone. Fee rate (max 1%) and vault address can only be changed by the Timelock, after the timelock delay (10 minutes minimum).

---

## 2. What is a Uniswap v4 hook? (30-second explainer)

- Uniswap v4 has a single contract, the **PoolManager**, and every pool lives inside it.
- Each pool can have one **hook contract** attached. It is set at pool creation with `PoolKey.hooks = hookAddress`.
- At fixed points in the pool lifecycle, the PoolManager calls the hook:
  `beforeInitialize / afterInitialize`, `beforeSwap / afterSwap`, `before/afterAddLiquidity`, `before/afterRemoveLiquidity`, `before/afterDonate`.
- Which callbacks a hook wants is encoded in the **last 14 bits of the hook's address** (permission flags). That is why a hook must be deployed to a specially mined address.

```
PoolManager ──swap()──▶ pool logic ──▶ afterSwap() callback ──▶ KyteHook
                                                        │
                                       fee WETH ◀───────┘ (poolManager.take → FeeVault)
```

---

## 3. Which callbacks KyteHook uses

| Callback | Used? | What it does |
|---|---|---|
| `afterInitialize` | ✅ | Writes the first tick observation when the pool is created |
| `afterSwap` | ✅ | Records the new tick and takes the fee |
| `afterSwapReturnDelta` | ✅ | Lets the hook deduct the fee from the swap output |
| everything else (`beforeSwap`, liquidity, donate, `beforeInitialize`) | ❌ | `revert NotImplemented()` |

Flags: `afterInitialize (1<<12) | afterSwap (1<<6) | afterSwapReturnDelta (1<<2) = 0x1044`.
The constructor runs `Hooks.validateHookPermissions(this, getHookPermissions())`, so deployment reverts if the address bits don't match.

---

## 4. Feature 1: Protocol fee (`afterSwap`)

Flow after every swap:

1. The hook reads the pool's current tick and writes it to the oracle (feature 2).
2. If `feeBps > 0` and `feeVault` is set, it looks at the swap's **unspecified currency**, the side the user did not give an exact amount for.
3. `feeCurrencyOnly` is set to **WETH**. The fee is only taken when the unspecified currency is WETH, so the `FeeVault` only receives what it can split.
4. `feeAmount = amount × feeBps / 10_000`
5. `poolManager.take(WETH, feeVault, feeAmount)` sends the fee directly to the vault.
6. A `HookFee(poolId, currency, amount)` event is emitted (the Proof page reads these).
7. `afterSwap` returns `feeAmount` as its return delta, so the PoolManager accounting stays balanced.

**Safety limits:**
- `MAX_FEE_BPS = 100` (max 1%). Kyte's default is **10 bps (0.10%)**.
- `setFee()` and `setFeeVault()` can only be called by `owner`, which is the **Timelock** (10 minute delay).

**Where does the fee go?** `FeeVault` → `split()` once per epoch:
**30% stakers · 20% buy-and-burn · 50% ops**. Anyone can call `split()`.

---

## 5. Feature 2: TWAP oracle

**Problem:** the buyback bot buys `$KYTE`. If its slippage limit is based on the spot price, an attacker can manipulate the price inside one block and drain value from the buyback.

**Solution:** after every swap the hook stores an `Observation { blockTimestamp, tickCumulative, tick }` in a **128-slot ring buffer** per pool (`CARDINALITY = 128`).

- Several swaps in the same block keep only the last tick.
- `consult(poolId, secondsAgo)` returns the **time-weighted average tick** over that window (clamped to the oldest observation if the history is shorter).
- `twapSqrtPriceX96(poolId, secondsAgo)` returns a `sqrtPriceX96` ready for quoting.

A single block cannot move the TWAP, so the buyback's slippage floor stays safe.

---

## 6. How the hook address is mined (`HookDeployer`)

v4 needs the low 14 bits of the address to equal the flags: `address & 0x3FFF == 0x1044`.

1. `HookDeployer` is a small **CREATE2 factory**.
2. `mine(initCodeHash, maxTries)` tries salts 0, 1, 2, … until the predicted address has the bits `0x1044`. This takes about 16,000 tries on average, and the script allows up to `400_000`.
3. `deploy(salt, initCode)` deploys KyteHook with that salt and emits `Deployed(hook, salt)`.

The step in `Deploy.s.sol`:

```solidity
HookDeployer hd = new HookDeployer();
bytes memory hookInit = bytes.concat(
    vm.getCode("KyteHook.sol:KyteHook"),
    abi.encode(POOL_MANAGER, timelock, feeVault, 10 /*bps*/, WETH)
);
(bytes32 salt,) = hd.mine(keccak256(hookInit), 400_000);
address hook = hd.deploy(salt, hookInit);
```

Constructor args: `poolManager, owner (timelock), feeVault, feeBps (10), feeCurrencyOnly (WETH)`.

---

## 7. How the pool is created with the hook

After the hook is deployed, the `$KYTE/WETH` pool is initialized with a `PoolKey`:

```solidity
PoolKey({
    currency0: <lower address>,
    currency1: <higher address>,
    fee: <LP fee>,
    tickSpacing: <spacing>,
    hooks: IHooks(kyteHook)      // <-- this attaches the hook
})
poolManager.initialize(key, sqrtPriceX96);
```

After `initialize`, the PoolManager calls `afterInitialize`, which writes the first oracle observation.

> ⚠️ The pool can only be created once the `$KYTE` token is live. The token is not live yet. The token address is **immutable** in `StakingPool` and `BuybackBurner`, so the hook and pool only do their full job after launch.

---

## 8. How the buyback uses the hook (`UniswapV4Adapter` + `BuybackBurner`)

```
FeeVault ─(20%)─▶ BuybackBurner ─▶ UniswapV4Adapter ─▶ PoolManager.swap (pool with KyteHook)
                                          │
                                 quote = hook.twapSqrtPriceX96(pool, 10 min)
                                          │
                                 BuybackBurner: output must be within slippage of the quote
                                          │
                                       burn $KYTE 🔥  (Burned event = Proof page)
```

- The adapter's `TWAP_WINDOW` is `10 minutes`.
- `quoteWethForToken(wethIn)` **always uses the TWAP** on a hooked pool. If the oracle cannot answer, the call **reverts**. There is **no fallback to spot**, so a manipulated spot price can never become the buyback's floor.
- The adapter constructor checks that the hook passed in is the same one in `key.hooks` (otherwise `BadPool`).
- The swap uses the `unlock → swap → sync/settle/take` pattern (a direct PoolManager swap, not the Universal Router).

---

## 9. Security and trust points (good for the video)

| Point | Detail |
|---|---|
| Owner | Timelock (10 minute delay), run by a Safe multisig |
| Fee cap | Hard-coded 1% max (`MAX_FEE_BPS`) |
| Fee destination | Straight to `FeeVault`, no team wallet in between |
| Who can call the hooks | Only the PoolManager (`onlyPoolManager`) |
| Unused callbacks | All `revert NotImplemented()` |
| Oracle | 10-min TWAP, 128 observations, same-block overwrite |
| Spot fallback | None on a hooked pool |
| Upgradability | Not upgradeable; the owner can only change `feeBps` and `feeVault` |

---

## 10. Suggested video outline (~5–6 min)

1. **Intro (0:00–0:30):** "How does Kyte collect a fee on every swap with no middleman?"
2. **v4 hook basics (0:30–1:30):** PoolManager + hook diagram (Section 2).
3. **What KyteHook does (1:30–2:30):** the two jobs and the callback table (Section 3).
4. **Fee flow live (2:30–3:30):** swap → `afterSwap` → `take` → FeeVault → 30/20/50 (Section 4). Show the `afterSwap` function.
5. **TWAP oracle (3:30–4:30):** ring buffer, `consult()`, manipulation protection (Section 5).
6. **Address mining demo (4:30–5:00):** `HookDeployer.mine` and the `0x1044` flags (Section 6).
7. **Buyback proof (5:00–5:40):** adapter → TWAP quote → burn → Proof page (Section 8).
8. **Outro (5:40–6:00):** the trust table, and "pool and hook go live after the token launches."

**Worth showing on screen:** `KyteHook.sol` (`afterSwap`, `consult`), `HookDeployer.sol` (`mine`), `UniswapV4Adapter.sol` (`quoteWethForToken`), and the site's **Proof** page.

---

## 11. Quick glossary

- **PoolManager:** the v4 singleton contract that holds all pools.
- **Hook:** a custom contract the PoolManager calls at pool lifecycle events.
- **PoolKey:** a pool's identity: `currency0, currency1, fee, tickSpacing, hooks`.
- **Tick:** a log-scale price index. `price = 1.0001^tick`.
- **TWAP:** time-weighted average price. It cannot be moved within a single block.
- **bps:** basis point. 1 bps = 0.01%, so 10 bps = 0.10%.
- **CREATE2:** deterministic deployment; changing the salt changes the resulting address.
- **Return delta:** lets a hook add to or deduct from a swap's amounts (here, the fee).
