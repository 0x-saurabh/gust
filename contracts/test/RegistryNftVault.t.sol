// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {OptionNFT} from "../src/OptionNFT.sol";
import {Constants} from "../src/lib/Constants.sol";
import {Errors} from "../src/lib/Errors.sol";
import {MockERC20} from "./mocks/Mocks.sol";

contract AssetRegistryTest is BaseTest {
    function test_addAsset_records() public view {
        AssetRegistry.Asset memory a = registry.getAsset(address(token));
        assertTrue(a.listed && a.enabled && a.putsEnabled);
        assertEq(a.decimals, 18);
        assertEq(a.cap, CAP);
        assertEq(a.minStrike, MIN_STRIKE);
        assertEq(registry.assetCount(), 1);
    }

    function test_addAsset_reverts() public {
        vm.prank(guardian);
        vm.expectRevert(Errors.NotTimelock.selector);
        registry.addAsset(address(1), 1, 1);

        vm.startPrank(timelock);
        vm.expectRevert(Errors.AssetExists.selector);
        registry.addAsset(address(token), 1, 1);
        vm.expectRevert(Errors.ZeroAddress.selector);
        registry.addAsset(address(0), 1, 1);
        vm.stopPrank();
    }

    function test_maxAssets() public {
        vm.startPrank(timelock);
        for (uint256 i = 1; i < Constants.MAX_ASSETS; ++i) {
            registry.addAsset(address(new MockERC20("T", "T", 18)), 1, 1);
        }
        address extra = address(new MockERC20("T", "T", 18));
        vm.expectRevert(Errors.TooManyAssets.selector);
        registry.addAsset(extra, 1, 1);
        vm.stopPrank();
    }

    function test_addAssets_batch() public {
        address[] memory toks = new address[](3);
        uint256[] memory caps = new uint256[](3);
        uint256[] memory mins = new uint256[](3);
        for (uint256 i; i < 3; ++i) {
            toks[i] = address(new MockERC20("S", "S", 18));
            caps[i] = 100e18 + i;
            mins[i] = 0.0001 ether;
        }
        vm.prank(stranger);
        vm.expectRevert(Errors.NotTimelock.selector);
        registry.addAssets(toks, caps, mins, true);

        vm.prank(timelock);
        registry.addAssets(toks, caps, mins, true);
        assertEq(registry.assetCount(), 4);
        for (uint256 i; i < 3; ++i) {
            AssetRegistry.Asset memory a = registry.getAsset(toks[i]);
            assertTrue(a.listed && a.enabled && a.putsEnabled);
            assertEq(a.cap, caps[i]);
            assertTrue(registry.putsEnabled(toks[i]));
        }

        // duplicates and length mismatches revert the whole batch
        vm.startPrank(timelock);
        vm.expectRevert(Errors.AssetExists.selector);
        registry.addAssets(toks, caps, mins, false);
        uint256[] memory short = new uint256[](2);
        vm.expectRevert(Errors.LengthMismatch.selector);
        registry.addAssets(toks, short, mins, false);
        vm.stopPrank();
    }

    function test_addAssets_putsOff() public {
        address[] memory toks = new address[](1);
        uint256[] memory caps = new uint256[](1);
        uint256[] memory mins = new uint256[](1);
        toks[0] = address(new MockERC20("S", "S", 18));
        caps[0] = 1;
        mins[0] = 1;
        vm.prank(timelock);
        registry.addAssets(toks, caps, mins, false);
        assertFalse(registry.putsEnabled(toks[0]));
        assertTrue(registry.isEnabled(toks[0]));
    }

    function test_guardianCanOnlyDisable() public {
        vm.startPrank(guardian);
        registry.setEnabled(address(token), false);
        registry.setPutsEnabled(address(token), false);
        vm.expectRevert(Errors.NotTimelock.selector);
        registry.setEnabled(address(token), true);
        vm.expectRevert(Errors.NotTimelock.selector);
        registry.setPutsEnabled(address(token), true);
        vm.stopPrank();

        vm.prank(stranger);
        vm.expectRevert(Errors.NotGuardian.selector);
        registry.setEnabled(address(token), false);

        vm.prank(timelock);
        registry.setEnabled(address(token), true);
        assertTrue(registry.isEnabled(address(token)));
        assertFalse(registry.putsEnabled(address(token)));
    }

    function test_putsNeedEnabledAsset() public {
        vm.prank(guardian);
        registry.setEnabled(address(token), false);
        assertFalse(registry.putsEnabled(address(token)));
    }

    function test_setters() public {
        vm.startPrank(timelock);
        registry.setCap(address(token), 5);
        registry.setMinStrike(address(token), 7);
        vm.expectRevert(Errors.UnknownAsset.selector);
        registry.setCap(address(0xbeef), 5);
        vm.stopPrank();
        assertEq(registry.cap(address(token)), 5);
        assertEq(registry.minStrike(address(token)), 7);
    }

    function test_setGuardian() public {
        vm.prank(timelock);
        registry.setGuardian(stranger);
        assertEq(registry.guardian(), stranger);
        vm.prank(guardian);
        vm.expectRevert(Errors.NotTimelock.selector);
        registry.setGuardian(guardian);
    }
}

contract OptionNFTTest is BaseTest {
    function test_setMarkets_onceOnly() public {
        vm.expectRevert(Errors.MarketsAlreadySet.selector);
        nft.setMarkets(address(1), address(2));

        OptionNFT fresh = new OptionNFT();
        vm.prank(stranger);
        vm.expectRevert(Errors.NotDeployer.selector);
        fresh.setMarkets(address(1), address(2));
    }

    function test_strangerCannotMintOrBurn() public {
        uint256 id = _filledCall();
        uint256 fresh = calls.idOf(77);
        vm.startPrank(stranger);
        vm.expectRevert(Errors.NotMarket.selector);
        nft.mint(stranger, fresh);
        vm.expectRevert(Errors.NotMarket.selector);
        nft.burn(id);
        vm.stopPrank();
    }

    function test_marketCannotMintOtherTag() public {
        uint256 putId = puts.idOf(1);
        vm.prank(address(calls));
        vm.expectRevert(Errors.NotMarket.selector);
        nft.mint(stranger, putId);
        vm.prank(address(calls));
        vm.expectRevert(Errors.NotMarket.selector);
        nft.mint(stranger, 5); // tag 0
    }

    function test_tokenURI() public {
        uint256 id = _filledCall();
        string memory uri = nft.tokenURI(id);
        assertEq(bytes(uri).length > 100, true);
        assertEq(_prefix(uri, 29), "data:application/json;base64,");
        uint256 pid = _filledPut();
        nft.tokenURI(pid);
    }

    function _prefix(string memory s, uint256 n) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(n);
        for (uint256 i; i < n; ++i) {
            out[i] = b[i];
        }
        return string(out);
    }
}

contract FeeVaultTest is BaseTest {
    function _feed(uint256 amount) internal {
        weth.mint(address(vault), amount);
    }

    function test_split_30_20_50() public {
        _feed(10 ether);
        vault.split();
        assertEq(weth.balanceOf(address(pool)), 3 ether);
        assertEq(pool.notified(), 3 ether);
        assertEq(weth.balanceOf(buyback), 2 ether);
        assertEq(weth.balanceOf(opsSafe), 5 ether);
        assertEq(weth.balanceOf(address(vault)), 0);
        assertEq(vault.totalSplit(), 10 ether);
    }

    function test_split_oncePerEpoch() public {
        _feed(1 ether);
        vault.split();
        _feed(1 ether);
        vm.expectRevert(Errors.SplitTooSoon.selector);
        vault.split();
        vm.warp(block.timestamp + Constants.EPOCH);
        vault.split();
    }

    function test_split_worksWhilePaused() public {
        vm.prank(guardian);
        vault.pause();
        _feed(1 ether);
        vault.split();
    }

    function test_split_reverts_empty() public {
        vm.expectRevert(Errors.NothingToSplit.selector);
        vault.split();
    }

    function test_split_reverts_notConfigured() public {
        FeeVault fresh = new FeeVault(IERC20(address(weth)), timelock, guardian);
        weth.mint(address(fresh), 1 ether);
        vm.expectRevert(Errors.NotConfigured.selector);
        fresh.split();
    }

    function test_setSplit_bounds() public {
        vm.startPrank(timelock);
        vm.expectRevert(Errors.BadSplit.selector);
        vault.setSplit(1_999, 3_001, 5_000);
        vm.expectRevert(Errors.BadSplit.selector);
        vault.setSplit(3_000, 2_000, 4_999);
        vault.setSplit(5_000, 5_000, 0);
        vm.stopPrank();

        _feed(1 ether);
        vault.split();
        assertEq(weth.balanceOf(opsSafe), 0);
    }

    function test_feesFromMarketsReachVault() public {
        uint256 id = _filledCall();
        vm.prank(buyer);
        calls.exercise(id);
        uint256 expected = PREMIUM * FEE_PREMIUM / 10_000 + STRIKE * FEE_EXERCISE / 10_000;
        assertEq(weth.balanceOf(address(vault)), expected);
    }

    /// Invariant 7: inflows == splits + balance.
    function testFuzz_conservation(uint256 a, uint256 b) public {
        a = bound(a, 1, 1e30);
        b = bound(b, 1, 1e30);
        _feed(a);
        vault.split();
        vm.warp(block.timestamp + Constants.EPOCH);
        _feed(b);
        vault.split();
        assertEq(vault.totalSplit() + weth.balanceOf(address(vault)), a + b);
    }
}
