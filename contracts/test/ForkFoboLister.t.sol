// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {FoboLister} from "../src/FoboLister.sol";

/// @notice Mainnet fork: the real timelock, the live v3 registry, the real FoboHook and tokens whose floor really
/// backs more than 4.2 ETH (9 Nov 2026: FOBO 29.4, FLORA 11.3, LOCKRA 4.5, XOXO 4.3). Skipped unless FORK=1.
///
///   FORK=1 forge test --match-contract ForkFoboLister -vv
contract ForkFoboLister is Test {
    address constant TIMELOCK = 0xf8E6fAF7e0E57bc91aD5C59B84FedE2Cab842893;
    address constant GUARDIAN = 0x9F433eE8020cFb3521bDaE0DDA612932e1E90EF0;
    address constant REGISTRY = 0x02f571e10B9c7303EB7A6284A7137b146e18658D; // v3, the live markets' registry
    address constant HOOK = 0x0Af57F62982D03066ef917AcAd87F771c06528Ec;

    address constant FOBO = 0x000DE658153f47f23e92973C8EB1e89762703676;
    address constant FLORA = 0x7BaE7a90c7328969614B3EFbeE8C4A9026beFEA8;
    address constant FOBRO = 0xc306419Aa06AC78a0e1AAf97aA6Aa2e9bEd3a63f; // ~2.6 ETH backed: below the bar
    address constant MARIO = 0x603A54e406816874d97a13a953B6a8bE0cDAF8e5; // quoted in $FOBO, not ETH
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    bool on;
    FoboLister lister;
    TimelockController timelock = TimelockController(payable(TIMELOCK));
    AssetRegistry registry = AssetRegistry(REGISTRY);

    function setUp() public {
        on = vm.envOr("FORK", uint256(0)) == 1;
        if (!on) return;
        vm.createSelectFork("robinhood");
        lister = new FoboLister(TIMELOCK, GUARDIAN, REGISTRY, HOOK, 200, 1e12, 1 days, 4.2 ether, true);
        vm.startPrank(TIMELOCK);
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(lister));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(lister));
        vm.stopPrank();
    }

    function test_fork_listsFoboAndFloraWithPuts() public {
        if (!on) return;
        address[2] memory ts = [FOBO, FLORA];
        for (uint256 i; i < ts.length; i++) {
            assertFalse(registry.getAsset(ts[i]).listed, "not yet listed");
            (uint256 cap, uint256 backing) = lister.check(ts[i]);
            assertGt(backing, 4.2 ether, "floor backs more than the bar");
            assertGt(cap, 0);
            lister.list(ts[i]);
        }
        vm.warp(block.timestamp + timelock.getMinDelay());
        for (uint256 i; i < ts.length; i++) {
            lister.execute(ts[i]);
            AssetRegistry.Asset memory a = registry.getAsset(ts[i]);
            assertTrue(a.enabled);
            assertTrue(a.putsEnabled);
            assertEq(a.minStrike, 1e12);
        }
    }

    function test_fork_refusesBelowBarFoboQuotedAndForeign() public {
        if (!on) return;
        vm.expectRevert(FoboLister.FloorTooLow.selector);
        lister.check(FOBRO);
        vm.expectRevert(FoboLister.NotFoboToken.selector); // MARIO's pool is quoted in $FOBO: no ETH pool exists
        lister.check(MARIO);
        vm.expectRevert(FoboLister.NotFoboToken.selector);
        lister.check(WETH);
    }
}
