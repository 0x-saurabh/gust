// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {UsdgRewards} from "../src/UsdgRewards.sol";
import {Errors} from "../src/lib/Errors.sol";
import {MockERC20} from "./mocks/Mocks.sol";

contract UsdgRewardsTest is Test {
    address timelock = makeAddr("timelock");
    address guardian = makeAddr("guardian");
    address publisher = makeAddr("publisher");
    address anyone = makeAddr("anyone");
    address a1 = 0x1111111111111111111111111111111111111111;
    address a2 = 0x2222222222222222222222222222222222222222;
    address a3 = 0x3333333333333333333333333333333333333333;

    MockERC20 usdg;
    UsdgRewards rewards;
    // Fixture built by indexer/src/merkle.mjs for epoch 7: a1 1.5 USDG, a2 2.5 USDG, a3 1 USDG (6 decimals).
    bytes32 constant ROOT = 0xa287fdbadc1527da551fbdb50531fb28d9b3fd97bb564be9c730c2397d049cd6;
    bytes32[] p0;
    bytes32[] p1;
    bytes32[] p2;
    uint256 constant EPOCH = 7;

    function setUp() public {
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        rewards = new UsdgRewards(timelock, guardian, address(usdg), publisher, 90 days);
        vm.warp((EPOCH + 1) * 1 days + 1 hours); // epoch 7 is over
        usdg.mint(address(rewards), 10_000_000); // 10 USDG budget
        p0 = new bytes32[](1);
        p0[0] = 0x8a4a579fa5445ba14812dbed662b2bda50879522ccde7b08b75299a774e5f154;

        p1 = new bytes32[](2);
        p1[0] = 0x863a473f190adbb409ad3fd9508537768dcd021c42db70f8193dd5ebf29c4dee;
        p1[1] = 0xb9de02571085f047dc8456ae7a6eb923902d6dcac8596d753e12b9840e805389;

        p2 = new bytes32[](2);
        p2[0] = 0x5051e2975d502445c1d713c39df96ad65e6946509bbb8fdff5954bf7cc962013;
        p2[1] = 0xb9de02571085f047dc8456ae7a6eb923902d6dcac8596d753e12b9840e805389;
    }

    function _publish() internal {
        vm.prank(publisher);
        rewards.publish(EPOCH, ROOT, 5_000_000);
    }

    function test_jsTreeVerifiesOnChain() public {
        _publish();
        vm.prank(anyone); // anyone may submit; the USDG goes to the leaf's account
        rewards.claim(EPOCH, a1, 1_500_000, p0);
        rewards.claim(EPOCH, a2, 2_500_000, p1);
        rewards.claim(EPOCH, a3, 1_000_000, p2);
        assertEq(usdg.balanceOf(a1), 1_500_000);
        assertEq(usdg.balanceOf(a2), 2_500_000);
        assertEq(usdg.balanceOf(a3), 1_000_000);
        assertEq(rewards.outstanding(), 0);
        assertEq(rewards.available(), 5_000_000);
    }

    function test_claimManyAndDoubleClaim() public {
        _publish();
        uint256[] memory es = new uint256[](1);
        es[0] = EPOCH;
        uint256[] memory am = new uint256[](1);
        am[0] = 1_500_000;
        bytes32[][] memory ps = new bytes32[][](1);
        ps[0] = p0;
        rewards.claimMany(es, a1, am, ps);
        assertEq(usdg.balanceOf(a1), 1_500_000);
        vm.expectRevert(abi.encodeWithSelector(UsdgRewards.AlreadyClaimed.selector, EPOCH, a1));
        rewards.claim(EPOCH, a1, 1_500_000, p0);
    }

    function test_wrongAmountOrAccountFails() public {
        _publish();
        vm.expectRevert(UsdgRewards.InvalidProof.selector);
        rewards.claim(EPOCH, a1, 1_600_000, p0);
        vm.expectRevert(UsdgRewards.InvalidProof.selector);
        rewards.claim(EPOCH, anyone, 1_500_000, p0);
        vm.expectRevert(UsdgRewards.InvalidProof.selector);
        rewards.claim(EPOCH, a1, 1_500_000, p1);
    }

    function test_publishNeedsFundingAndFinalEpoch() public {
        vm.startPrank(publisher);
        vm.expectRevert(abi.encodeWithSelector(UsdgRewards.InsufficientFunding.selector, 20_000_000, 10_000_000));
        rewards.publish(EPOCH, ROOT, 20_000_000);
        vm.expectRevert(abi.encodeWithSelector(UsdgRewards.EpochNotFinal.selector, EPOCH + 1));
        rewards.publish(EPOCH + 1, ROOT, 1); // the current epoch
        rewards.publish(EPOCH, ROOT, 5_000_000);
        vm.expectRevert(abi.encodeWithSelector(UsdgRewards.EpochExists.selector, EPOCH));
        rewards.publish(EPOCH, ROOT, 5_000_000);
        // the second root can only use what is not owed: 10 - 5 = 5
        vm.expectRevert(abi.encodeWithSelector(UsdgRewards.InsufficientFunding.selector, 5_000_001, 5_000_000));
        rewards.publish(EPOCH - 1, ROOT, 5_000_001);
        vm.stopPrank();
        vm.expectRevert(UsdgRewards.NotPublisher.selector);
        rewards.publish(EPOCH - 1, ROOT, 1);
    }

    function test_guardianPausesPublishingNotClaims() public {
        _publish();
        vm.prank(guardian);
        rewards.pause();
        vm.prank(publisher);
        vm.expectRevert(Errors.MarketPaused.selector);
        rewards.publish(EPOCH - 1, ROOT, 1);
        rewards.claim(EPOCH, a1, 1_500_000, p0); // exits never pause
        assertEq(usdg.balanceOf(a1), 1_500_000);
    }

    function test_revokeOnlyBeforeClaims() public {
        _publish();
        vm.prank(guardian);
        rewards.revoke(EPOCH);
        assertEq(rewards.outstanding(), 0);
        (bytes32 root,,,,,) = rewards.epochs(EPOCH);
        assertEq(root, bytes32(0));
        _publish(); // can be published again
        rewards.claim(EPOCH, a1, 1_500_000, p0);
        vm.prank(timelock);
        vm.expectRevert(abi.encodeWithSelector(UsdgRewards.ClaimsStarted.selector, EPOCH));
        rewards.revoke(EPOCH);
        vm.prank(anyone);
        vm.expectRevert(Errors.NotGuardian.selector);
        rewards.revoke(EPOCH);
    }

    function test_expiryAndSweep() public {
        _publish();
        rewards.claim(EPOCH, a1, 1_500_000, p0);
        vm.expectRevert(abi.encodeWithSelector(UsdgRewards.EpochNotExpired.selector, EPOCH));
        rewards.sweep(EPOCH);
        vm.warp(block.timestamp + 90 days + 1);
        vm.expectRevert(abi.encodeWithSelector(UsdgRewards.EpochExpired.selector, EPOCH));
        rewards.claim(EPOCH, a2, 2_500_000, p1);
        rewards.sweep(EPOCH);
        assertEq(rewards.outstanding(), 0);
        assertEq(rewards.available(), 8_500_000); // 10 - 1.5 claimed, the rest back in the budget
        vm.expectRevert(abi.encodeWithSelector(UsdgRewards.UnknownEpoch.selector, EPOCH));
        rewards.sweep(EPOCH);
    }

    function test_withdrawNeverTouchesOwed() public {
        _publish();
        vm.prank(timelock);
        vm.expectRevert(abi.encodeWithSelector(UsdgRewards.InsufficientFunding.selector, 5_000_001, 5_000_000));
        rewards.withdraw(timelock, 5_000_001);
        vm.prank(timelock);
        rewards.withdraw(timelock, 5_000_000);
        assertEq(usdg.balanceOf(timelock), 5_000_000);
        rewards.claim(EPOCH, a2, 2_500_000, p1); // still fully funded
        vm.expectRevert(Errors.NotTimelock.selector);
        rewards.withdraw(anyone, 1);
    }

    function test_adminSetters() public {
        vm.expectRevert(Errors.NotTimelock.selector);
        rewards.setPublisher(anyone);
        vm.startPrank(timelock);
        rewards.setPublisher(anyone);
        assertEq(rewards.publisher(), anyone);
        vm.expectRevert(UsdgRewards.BadWindow.selector);
        rewards.setClaimWindow(1 days);
        rewards.setClaimWindow(30 days);
        assertEq(rewards.claimWindow(), 30 days);
        vm.stopPrank();
        vm.prank(anyone);
        rewards.publish(EPOCH, ROOT, 5_000_000);
        (,,,, uint64 expiresAt,) = rewards.epochs(EPOCH);
        assertEq(expiresAt, block.timestamp + 30 days);
    }
}
