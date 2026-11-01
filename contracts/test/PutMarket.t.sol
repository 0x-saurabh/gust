// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {Constants} from "../src/lib/Constants.sol";
import {Errors} from "../src/lib/Errors.sol";
import {Status} from "../src/lib/Types.sol";

contract PutMarketTest is BaseTest {
    function test_createPutOffer_escrowsStrike() public {
        uint256 before = weth.balanceOf(seller);
        uint256 id = _put();
        assertEq(id >> 248, Constants.PUT_TAG);
        assertEq(weth.balanceOf(seller), before - STRIKE);
        assertEq(weth.balanceOf(address(puts)), STRIKE);
        assertEq(puts.locked(address(weth)), STRIKE);
        assertEq(puts.exposure(address(token)), AMOUNT);
    }

    function test_exercisePut_swapsTokensForStrike() public {
        uint256 id = _filledPut();
        uint256 buyerWeth = weth.balanceOf(buyer);
        uint256 sellerTokens = token.balanceOf(seller);
        uint256 vaultWeth = weth.balanceOf(address(vault));

        vm.prank(buyer);
        puts.exercisePut(id);

        uint256 fee = STRIKE * FEE_EXERCISE / 10_000;
        assertEq(weth.balanceOf(buyer), buyerWeth + STRIKE - fee);
        assertEq(weth.balanceOf(address(vault)), vaultWeth + fee);
        assertEq(token.balanceOf(seller), sellerTokens + AMOUNT);
        assertEq(token.balanceOf(address(puts)), 0);
        assertEq(weth.balanceOf(address(puts)), 0);
        assertEq(puts.locked(address(weth)), 0);
        assertEq(uint8(puts.getPosition(id).status), uint8(Status.Exercised));
    }

    function test_expirePut_returnsWethToSeller() public {
        uint256 id = _filledPut();
        uint256 before = weth.balanceOf(seller);
        vm.warp(_expiry());
        puts.expire(id);
        assertEq(weth.balanceOf(seller), before + STRIKE);
        assertEq(puts.locked(address(weth)), 0);
    }

    function test_cancelPut_returnsWeth() public {
        uint256 id = _put();
        uint256 before = weth.balanceOf(seller);
        vm.prank(seller);
        puts.cancelUnfilled(id);
        assertEq(weth.balanceOf(seller), before + STRIKE);
    }

    function test_create_reverts_putsNotEnabled() public {
        vm.prank(guardian);
        registry.setPutsEnabled(address(token), false);
        vm.prank(seller);
        vm.expectRevert(Errors.PutsNotEnabled.selector);
        puts.createPutOffer(address(token), AMOUNT, STRIKE, PREMIUM, _expiry(), _deadline());
    }

    function test_create_reverts_whenAssetDisabled() public {
        vm.prank(guardian);
        registry.setEnabled(address(token), false);
        vm.prank(seller);
        vm.expectRevert(Errors.PutsNotEnabled.selector);
        puts.createPutOffer(address(token), AMOUNT, STRIKE, PREMIUM, _expiry(), _deadline());
    }

    function test_exercisePut_reverts() public {
        uint256 id = _filledPut();
        vm.prank(stranger);
        vm.expectRevert(Errors.NotHolder.selector);
        puts.exercisePut(id);

        vm.warp(_expiry());
        vm.prank(buyer);
        vm.expectRevert(Errors.OptionExpired.selector);
        puts.exercisePut(id);
    }

    function test_exercisePut_holderIsSeller() public {
        uint256 id = _filledPut();
        vm.prank(buyer);
        nft.transferFrom(buyer, seller, id);
        uint256 tokens = token.balanceOf(seller);
        uint256 wethBefore = weth.balanceOf(seller);
        vm.prank(seller);
        puts.exercisePut(id);
        assertEq(token.balanceOf(seller), tokens);
        assertEq(weth.balanceOf(seller), wethBefore + STRIKE - STRIKE * FEE_EXERCISE / 10_000);
    }

    function test_router_createPutOfferFor() public {
        vm.prank(router);
        uint256 id = puts.createPutOfferFor(seller, address(token), AMOUNT, STRIKE, PREMIUM, _expiry(), _deadline());
        assertEq(puts.getPosition(id).seller, seller);
        assertEq(puts.openOffers(seller), 1);

        vm.prank(stranger);
        vm.expectRevert(Errors.NotRouter.selector);
        puts.createPutOfferFor(stranger, address(token), AMOUNT, STRIKE, PREMIUM, _expiry(), _deadline());
    }

    function test_pause_blocksCreateButNotExercise() public {
        uint256 id = _filledPut();
        vm.prank(guardian);
        puts.pause();
        vm.prank(seller);
        vm.expectRevert(Errors.MarketPaused.selector);
        puts.createPutOffer(address(token), AMOUNT, STRIKE, PREMIUM, _expiry(), _deadline());
        vm.prank(buyer);
        puts.exercisePut(id);
    }

    function test_marketsAreIsolated() public {
        _filledCall();
        _filledPut();
        assertEq(token.balanceOf(address(calls)), AMOUNT);
        assertEq(weth.balanceOf(address(puts)), STRIKE);
        assertEq(token.balanceOf(address(puts)), 0);
        assertEq(weth.balanceOf(address(calls)), 0);
    }
}
