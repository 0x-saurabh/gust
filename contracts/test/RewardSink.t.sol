// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RewardSink} from "../src/RewardSink.sol";
import {Errors} from "../src/lib/Errors.sol";
import {MockERC20} from "./mocks/Mocks.sol";

contract RewardSinkTest is Test {
    address timelock = makeAddr("timelock");
    address guardian = makeAddr("guardian");
    address anyone = makeAddr("anyone");
    MockERC20 whype;
    RewardSink sink;

    function setUp() public {
        whype = new MockERC20("Wrapped HYPE", "WHYPE", 18);
        sink = new RewardSink(IERC20(address(whype)), timelock, guardian);
    }

    function test_notifyCountsAndHolds() public {
        whype.mint(address(sink), 3 ether);
        vm.prank(anyone);
        sink.notifyReward(3 ether);
        assertEq(sink.totalNotified(), 3 ether);
        assertEq(whype.balanceOf(address(sink)), 3 ether);
    }

    function test_onlyTimelockWithdraws() public {
        whype.mint(address(sink), 2 ether);
        vm.expectRevert(Errors.NotTimelock.selector);
        sink.withdraw(anyone, 1 ether);
        vm.prank(guardian);
        vm.expectRevert(Errors.NotTimelock.selector);
        sink.withdraw(anyone, 1 ether);
        vm.prank(timelock);
        vm.expectRevert(Errors.ZeroAddress.selector);
        sink.withdraw(address(0), 1 ether);
        vm.prank(timelock);
        sink.withdraw(anyone, 2 ether);
        assertEq(whype.balanceOf(anyone), 2 ether);
        assertEq(whype.balanceOf(address(sink)), 0);
    }

    function test_rejectsZeroToken() public {
        vm.expectRevert(Errors.ZeroAddress.selector);
        new RewardSink(IERC20(address(0)), timelock, guardian);
    }
}
