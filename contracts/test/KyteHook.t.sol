// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {UniswapV4Adapter} from "../src/adapters/UniswapV4Adapter.sol";
import {KyteHook} from "../src/hooks/KyteHook.sol";

/// @dev Real PoolManager + pool with the hook attached: fee lands in the vault, TWAP tracks swaps.
contract KyteHookTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;

    address internal timelock = makeAddr("timelock");
    address internal vault = makeAddr("feeVault");
    KyteHook internal hook;
    PoolId internal id;

    function setUp() public {
        deployFreshManagerAndRouters();
        (currency0, currency1) = deployMintAndApprove2Currencies();
        // v4 reads permissions from the address: etch the hook at an address with exactly these flag bits.
        address at = address(
            uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG)
                | (uint160(0x4a11) << 144)
        );
        deployCodeTo(
            "KyteHook.sol:KyteHook", abi.encode(manager, timelock, vault, uint256(10), Currency.wrap(address(0))), at
        );
        hook = KyteHook(at);
        (key, id) = initPoolAndAddLiquidity(currency0, currency1, IHooks(at), 3000, SQRT_PRICE_1_1);
    }

    function test_permissionsAndConfig() public view {
        assertEq(hook.feeBps(), 10);
        assertEq(hook.feeVault(), vault);
        assertEq(hook.owner(), timelock);
        (, uint16 count) = hook.oracle(id);
        assertEq(count, 1); // afterInitialize wrote the first observation
    }

    function test_feeGoesToVault_exactInput() public {
        uint256 amountIn = 1e15;
        uint256 v0 = IERC20(Currency.unwrap(currency1)).balanceOf(vault);
        uint256 out0 = IERC20(Currency.unwrap(currency1)).balanceOf(address(this));
        swap(key, true, -int256(amountIn), ZERO_BYTES);
        uint256 fee = IERC20(Currency.unwrap(currency1)).balanceOf(vault) - v0;
        uint256 received = IERC20(Currency.unwrap(currency1)).balanceOf(address(this)) - out0;
        assertGt(fee, 0);
        // 10 bps of the gross output: fee == (received + fee) * 10 / 10000 (within rounding)
        assertApproxEqAbs(fee, (received + fee) * 10 / 10_000, 2);
    }

    function test_feeGoesToVault_exactOutput() public {
        uint256 v0 = IERC20(Currency.unwrap(currency0)).balanceOf(vault);
        swap(key, true, int256(1e15), ZERO_BYTES); // exact output of currency1; fee on the input currency0
        assertGt(IERC20(Currency.unwrap(currency0)).balanceOf(vault) - v0, 0);
    }

    function test_zeroFee_takesNothing() public {
        vm.prank(timelock);
        hook.setFee(0);
        uint256 v0 = IERC20(Currency.unwrap(currency1)).balanceOf(vault);
        swap(key, true, -int256(1e15), ZERO_BYTES);
        assertEq(IERC20(Currency.unwrap(currency1)).balanceOf(vault), v0);
    }

    function test_adminBounds() public {
        vm.prank(timelock);
        vm.expectRevert(KyteHook.FeeTooHigh.selector);
        hook.setFee(101);
        vm.expectRevert(KyteHook.NotOwner.selector);
        hook.setFee(5);
        vm.prank(timelock);
        hook.setFeeVault(address(0xbeef));
        assertEq(hook.feeVault(), address(0xbeef));
    }

    function test_twap_followsPriceOverTime() public {
        int24 t0 = hook.consult(id, 0);
        // push the price down with a large swap, then let time pass
        swap(key, true, -int256(5e17), ZERO_BYTES);
        int24 t1 = hook.consult(id, 0);
        assertLt(t1, t0);
        vm.warp(block.timestamp + 600);
        swap(key, false, -int256(1e12), ZERO_BYTES); // tiny swap to write an observation
        int24 mean = hook.consult(id, 600);
        // over the last 10 minutes the pool sat at ~t1, so the mean is near t1, far below t0
        assertLt(mean, t0);
        assertApproxEqAbs(int256(mean), int256(t1), 50);
        // once the latest tick has been in force for a while, a short window equals it
        vm.warp(block.timestamp + 30);
        assertApproxEqAbs(int256(hook.consult(id, 1)), int256(hook.consult(id, 0)), 1);
        assertGt(hook.twapSqrtPriceX96(id, 600), 0);
    }

    function test_twap_isNotMovedByOneBlockSpike() public {
        vm.warp(block.timestamp + 3600);
        swap(key, false, -int256(1e12), ZERO_BYTES);
        int24 before = hook.consult(id, 1800);
        swap(key, true, -int256(8e17), ZERO_BYTES); // spike in the same block
        int24 after_ = hook.consult(id, 1800);
        assertApproxEqAbs(int256(before), int256(after_), 2); // zero elapsed time: no weight
    }

    function test_adapterQuotesTwapWhenHooked() public {
        MockERC20 w = MockERC20(Currency.unwrap(currency0));
        UniswapV4Adapter a =
            new UniswapV4Adapter(manager, IERC20(address(w)), IERC20(Currency.unwrap(currency1)), key, hook);
        uint256 spotQuote = a.quoteSpot(1e15);
        // ten minutes at the opening price, then a shock in a new block
        vm.warp(block.timestamp + 600);
        swap(key, false, -int256(1e12), ZERO_BYTES);
        swap(key, true, -int256(5e17), ZERO_BYTES); // spot moves a lot
        uint256 twapQuote = a.quoteWethForToken(1e15);
        uint256 spotAfter = a.quoteSpot(1e15);
        assertLt(spotAfter, spotQuote);
        // TWAP (10 min) still reflects mostly the old price
        assertGt(twapQuote, spotAfter);
    }

    function test_feeOnlyOnConfiguredCurrency() public {
        address at = address(
            uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG)
                | (uint160(0x4a12) << 144)
        );
        deployCodeTo("KyteHook.sol:KyteHook", abi.encode(manager, timelock, vault, uint256(10), currency0), at);
        (PoolKey memory k2,) = initPoolAndAddLiquidity(currency0, currency1, IHooks(at), 3000, SQRT_PRICE_1_1);
        uint256 v1 = IERC20(Currency.unwrap(currency1)).balanceOf(vault);
        uint256 v0 = IERC20(Currency.unwrap(currency0)).balanceOf(vault);
        swap(k2, true, -int256(1e15), ZERO_BYTES); // fee side would be currency1: not eligible, nothing taken
        assertEq(IERC20(Currency.unwrap(currency1)).balanceOf(vault), v1);
        swap(k2, false, -int256(1e15), ZERO_BYTES); // fee side currency0: taken
        assertGt(IERC20(Currency.unwrap(currency0)).balanceOf(vault), v0);
    }

    function test_unimplementedHooksRevert() public {
        vm.expectRevert(KyteHook.NotImplemented.selector);
        hook.beforeInitialize(address(0), key, 0);
    }
}
