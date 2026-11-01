// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {Router} from "../src/Router.sol";
import {IWETH} from "../src/interfaces/IWETH.sol";
import {Errors} from "../src/lib/Errors.sol";
import {Status} from "../src/lib/Types.sol";

contract RouterTest is BaseTest {
    Router internal r;
    address internal eve = makeAddr("eve"); // has ETH only

    function setUp() public override {
        super.setUp();
        r = new Router(IWETH(address(weth)), calls, puts);
        vm.startPrank(timelock);
        calls.setRouter(address(r));
        puts.setRouter(address(r));
        vm.stopPrank();
        vm.deal(eve, 100 ether);
    }

    function _assertEmpty() internal view {
        assertEq(weth.balanceOf(address(r)), 0);
        assertEq(address(r).balance, 0);
    }

    function test_buyWithETH_refundsExcess() public {
        uint256 id = _call();
        uint256 sellerWeth = weth.balanceOf(seller);
        vm.prank(eve);
        r.buyWithETH{value: 1 ether}(id, PREMIUM);
        assertEq(nft.ownerOf(id), eve);
        assertEq(eve.balance, 100 ether - PREMIUM);
        assertEq(weth.balanceOf(seller), sellerWeth + PREMIUM - PREMIUM * FEE_PREMIUM / 10_000);
        _assertEmpty();
    }

    function test_buyWithETH_insufficient() public {
        uint256 id = _call();
        vm.prank(eve);
        vm.expectRevert(Errors.InsufficientValue.selector);
        r.buyWithETH{value: PREMIUM - 1}(id, PREMIUM);
    }

    function test_exerciseWithETH() public {
        uint256 id = _call();
        vm.prank(eve);
        r.buyWithETH{value: PREMIUM}(id, PREMIUM);
        vm.prank(eve);
        r.exerciseWithETH{value: STRIKE + 0.5 ether}(id);
        assertEq(token.balanceOf(eve), AMOUNT);
        assertEq(eve.balance, 100 ether - PREMIUM - STRIKE);
        assertEq(uint8(calls.getPosition(id).status), uint8(Status.Exercised));
        _assertEmpty();
    }

    function test_exerciseWithETH_notHolder() public {
        uint256 id = _filledCall();
        vm.prank(eve);
        vm.expectRevert(Errors.NotHolder.selector);
        r.exerciseWithETH{value: STRIKE}(id);
    }

    function test_createPutOfferWithETH_and_buyPut() public {
        vm.prank(eve);
        uint256 id = r.createPutOfferWithETH{value: STRIKE + 1 ether}(
            address(token), AMOUNT, STRIKE, PREMIUM, _expiry(), _deadline()
        );
        assertEq(puts.getPosition(id).seller, eve);
        assertEq(eve.balance, 100 ether - STRIKE);
        assertEq(weth.balanceOf(address(puts)), STRIKE);
        _assertEmpty();

        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        r.buyPutWithETH{value: PREMIUM}(id, PREMIUM);
        assertEq(nft.ownerOf(id), stranger);
        assertEq(weth.balanceOf(eve), PREMIUM - PREMIUM * FEE_PREMIUM / 10_000);
        _assertEmpty();
    }

    function test_selfTradeThroughRouter() public {
        uint256 id = _call();
        vm.deal(seller, 1 ether);
        vm.prank(seller);
        vm.expectRevert(Errors.SelfTrade.selector);
        r.buyWithETH{value: PREMIUM}(id, PREMIUM);
    }

    function test_routerRejectsStrayEth() public {
        vm.prank(eve);
        (bool ok,) = address(r).call{value: 1}("");
        assertFalse(ok);
    }
}
