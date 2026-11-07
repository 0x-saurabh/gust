// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {PonsLister} from "../src/PonsLister.sol";

/// @notice Mainnet fork: the real timelock, the live v3 registry, the real Pons factories and lockers, and tokens
/// that really graduated. Skipped unless FORK=1.
///
///   FORK=1 forge test --match-contract ForkPonsLister -vv
contract ForkPonsLister is Test {
    address constant TIMELOCK = 0xf8E6fAF7e0E57bc91aD5C59B84FedE2Cab842893;
    address constant GUARDIAN = 0x9F433eE8020cFb3521bDaE0DDA612932e1E90EF0;
    address constant REGISTRY = 0x02f571e10B9c7303EB7A6284A7137b146e18658D; // v3, the live markets' registry
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant FACTORY = 0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB;
    address constant LEGACY_FACTORY = 0x0c37a24F5D23A486FA692d1500881d698B1F77a4;
    address constant LOCKER = 0x736D76699C26D0d966744cAe304C000d471f7F35;
    address constant LEGACY_LOCKER = 0x31ca5E101941A93A7DD6d0497928700625CF54B5;

    address constant OZZY = 0x3d2Aa79e21AfF9fa97b82be22DA83D3eeCB09640;
    address constant YOLO = 0x62C71cd34a52c30d894419CBcc55Db2aFA8032eA;
    address constant PONGO = 0xedAee44320107CAa714BaAEc486261A87F27022d;
    address constant LINK = 0xe6864e4630D4d7A0cAd2E61f6BC2C0dcAD777712;
    address constant PONS = 0x39dBED3a2bd333467115dE45665cC57F813C4571; // legacy factory, already listed on Kyte

    bool on;
    PonsLister lister;
    TimelockController timelock = TimelockController(payable(TIMELOCK));
    AssetRegistry registry = AssetRegistry(REGISTRY);

    function setUp() public {
        on = vm.envOr("FORK", uint256(0)) == 1;
        if (!on) return;
        vm.createSelectFork("robinhood");
        address[] memory fs = new address[](2);
        fs[0] = FACTORY;
        fs[1] = LEGACY_FACTORY;
        address[] memory ls = new address[](2);
        ls[0] = LOCKER;
        ls[1] = LEGACY_LOCKER;
        lister = new PonsLister(TIMELOCK, GUARDIAN, REGISTRY, WETH, fs, ls, 200, 1e12);
        // what the one Safe operation will do: the timelock grants the lister its two roles
        vm.startPrank(TIMELOCK);
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(lister));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(lister));
        vm.stopPrank();
    }

    function test_fork_listsTheFourGraduatedTokens() public {
        if (!on) return;
        address[4] memory ts = [OZZY, YOLO, PONGO, LINK];
        for (uint256 i; i < ts.length; i++) {
            assertFalse(registry.getAsset(ts[i]).listed, "not yet listed");
            (uint256 cap, address f) = lister.check(ts[i]);
            assertEq(f, FACTORY);
            assertGt(cap, 0);
            lister.list(ts[i]);
        }
        vm.warp(block.timestamp + timelock.getMinDelay());
        for (uint256 i; i < ts.length; i++) {
            lister.execute(ts[i]);
            AssetRegistry.Asset memory a = registry.getAsset(ts[i]);
            assertTrue(a.enabled);
            assertEq(a.decimals, 18);
            assertEq(a.cap, lister.capOf(ts[i]));
            assertEq(a.minStrike, 1e12);
        }
    }

    function test_fork_alreadyListedPonsIsRefused() public {
        if (!on) return;
        vm.expectRevert(PonsLister.AlreadyListed.selector);
        lister.list(PONS);
    }

    function test_fork_randomTokenIsRefused() public {
        if (!on) return;
        vm.expectRevert(PonsLister.NotPonsToken.selector);
        lister.list(WETH);
    }

    function test_fork_rolesAreTheOnlyThingNeeded() public {
        if (!on) return;
        // without the roles, list reverts inside the timelock
        address[] memory fs = new address[](1);
        fs[0] = FACTORY;
        address[] memory ls = new address[](1);
        ls[0] = LOCKER;
        PonsLister bare = new PonsLister(TIMELOCK, GUARDIAN, REGISTRY, WETH, fs, ls, 200, 1e12);
        vm.expectRevert();
        bare.list(OZZY);
    }
}
