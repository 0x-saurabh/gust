// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {Constants} from "../src/lib/Constants.sol";
import {Errors} from "../src/lib/Errors.sol";
import {Position, Status} from "../src/lib/Types.sol";
import {FeeOnTransferToken, MockERC20} from "./mocks/Mocks.sol";

contract CallMarketTest is BaseTest {
    // ------------------------------------------------------------ happy paths

    function test_createOffer_escrowsAndRecords() public {
        uint256 before = token.balanceOf(seller);
        uint256 id = _call();

        assertEq(id >> 248, Constants.CALL_TAG);
        assertEq(token.balanceOf(seller), before - AMOUNT);
        assertEq(token.balanceOf(address(calls)), AMOUNT);
        assertEq(calls.locked(address(token)), AMOUNT);
        assertEq(calls.exposure(address(token)), AMOUNT);
        assertEq(calls.openOffers(seller), 1);

        Position memory p = calls.getPosition(id);
        assertEq(p.seller, seller);
        assertEq(uint8(p.status), uint8(Status.Open));
        assertEq(p.feeBpsPremium, FEE_PREMIUM);
        assertEq(p.feeBpsExercise, FEE_EXERCISE);
    }

    function test_buy_splitsPremiumAndMintsNft() public {
        uint256 id = _call();
        uint256 sellerWeth = weth.balanceOf(seller);
        uint256 buyerWeth = weth.balanceOf(buyer);

        vm.prank(buyer);
        calls.buy(id, PREMIUM);

        uint256 fee = PREMIUM * FEE_PREMIUM / 10_000;
        assertEq(weth.balanceOf(address(vault)), fee);
        assertEq(weth.balanceOf(seller), sellerWeth + PREMIUM - fee);
        assertEq(weth.balanceOf(buyer), buyerWeth - PREMIUM);
        assertEq(nft.ownerOf(id), buyer);
        assertEq(uint8(calls.getPosition(id).status), uint8(Status.Filled));
        assertEq(calls.openOffers(seller), 0);
    }

    function test_exercise_paysStrikeAndDeliversTokens() public {
        uint256 id = _filledCall();
        uint256 sellerWeth = weth.balanceOf(seller);
        uint256 vaultWeth = weth.balanceOf(address(vault));
        uint256 buyerTokens = token.balanceOf(buyer);

        vm.prank(buyer);
        calls.exercise(id);

        uint256 fee = STRIKE * FEE_EXERCISE / 10_000;
        assertEq(weth.balanceOf(seller), sellerWeth + STRIKE - fee);
        assertEq(weth.balanceOf(address(vault)), vaultWeth + fee);
        assertEq(token.balanceOf(buyer), buyerTokens + AMOUNT);
        assertEq(token.balanceOf(address(calls)), 0);
        assertEq(calls.locked(address(token)), 0);
        assertEq(calls.exposure(address(token)), 0);
        assertEq(uint8(calls.getPosition(id).status), uint8(Status.Exercised));
        vm.expectRevert();
        nft.ownerOf(id);
    }

    function test_expire_returnsTokensToSeller() public {
        uint256 id = _filledCall();
        uint256 before = token.balanceOf(seller);
        vm.warp(_expiry());

        vm.prank(stranger);
        calls.expire(id);

        assertEq(token.balanceOf(seller), before + AMOUNT);
        assertEq(calls.locked(address(token)), 0);
        assertEq(uint8(calls.getPosition(id).status), uint8(Status.Expired));
        vm.expectRevert();
        nft.ownerOf(id);
    }

    function test_cancelUnfilled_returnsTokens() public {
        uint256 id = _call();
        uint256 before = token.balanceOf(seller);
        vm.prank(seller);
        calls.cancelUnfilled(id);

        assertEq(token.balanceOf(seller), before + AMOUNT);
        assertEq(calls.locked(address(token)), 0);
        assertEq(calls.openOffers(seller), 0);
        assertEq(uint8(calls.getPosition(id).status), uint8(Status.Cancelled));
    }

    function test_cancel_allowedAfterDeadline() public {
        uint256 id = _call();
        vm.warp(_expiry() + 30 days);
        vm.prank(seller);
        calls.cancelUnfilled(id);
    }

    function test_transferredNft_newHolderExercises() public {
        uint256 id = _filledCall();
        vm.prank(buyer);
        nft.transferFrom(buyer, stranger, id);

        vm.prank(buyer);
        vm.expectRevert(Errors.NotHolder.selector);
        calls.exercise(id);

        _fund(stranger);
        vm.prank(stranger);
        calls.exercise(id);
        assertGe(token.balanceOf(stranger), AMOUNT);
    }

    // ------------------------------------------------------------ pause semantics (SPEC.md §8.5)

    function test_pause_blocksOnlyNewExposure() public {
        uint256 open = _call();
        uint256 filled = _filledCall();
        uint256 toExpire = _filledCall();

        vm.prank(guardian);
        calls.pause();

        vm.prank(seller);
        vm.expectRevert(Errors.MarketPaused.selector);
        calls.createOffer(address(token), AMOUNT, STRIKE, PREMIUM, _expiry(), _deadline());

        vm.prank(buyer);
        vm.expectRevert(Errors.MarketPaused.selector);
        calls.buy(open, PREMIUM);

        // exits keep working
        vm.prank(seller);
        calls.cancelUnfilled(open);
        vm.prank(buyer);
        calls.exercise(filled);
        vm.warp(_expiry());
        calls.expire(toExpire);
    }

    function test_unpause_onlyTimelock() public {
        vm.prank(guardian);
        calls.pause();
        vm.prank(guardian);
        vm.expectRevert(Errors.NotTimelock.selector);
        calls.unpause();
        vm.prank(timelock);
        calls.unpause();
        assertFalse(calls.paused());
    }

    function test_pause_strangerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(Errors.NotGuardian.selector);
        calls.pause();
    }

    // ------------------------------------------------------------ fees

    function test_feeChange_doesNotAffectOpenPositions() public {
        uint256 id = _call();
        vm.prank(timelock);
        calls.setFees(1_000, 100);

        vm.prank(buyer);
        calls.buy(id, PREMIUM);
        assertEq(weth.balanceOf(address(vault)), PREMIUM * FEE_PREMIUM / 10_000);

        uint256 id2 = _call();
        assertEq(calls.getPosition(id2).feeBpsPremium, 1_000);
    }

    function test_setFees_boundsAndAccess() public {
        vm.prank(timelock);
        vm.expectRevert(Errors.FeeAboveCap.selector);
        calls.setFees(1_001, 10);
        vm.prank(timelock);
        vm.expectRevert(Errors.FeeAboveCap.selector);
        calls.setFees(300, 101);
        vm.prank(guardian);
        vm.expectRevert(Errors.NotTimelock.selector);
        calls.setFees(300, 10);
    }

    // ------------------------------------------------------------ createOffer reverts

    function test_create_reverts_assetNotEnabled() public {
        vm.prank(guardian);
        registry.setEnabled(address(token), false);
        vm.prank(seller);
        vm.expectRevert(Errors.AssetNotEnabled.selector);
        calls.createOffer(address(token), AMOUNT, STRIKE, PREMIUM, _expiry(), _deadline());
    }

    function test_create_reverts_amountZero() public {
        vm.prank(seller);
        vm.expectRevert(Errors.AmountZero.selector);
        calls.createOffer(address(token), 0, STRIKE, PREMIUM, _expiry(), _deadline());
    }

    function test_create_reverts_strikeTooLow() public {
        vm.prank(seller);
        vm.expectRevert(Errors.StrikeTooLow.selector);
        calls.createOffer(address(token), AMOUNT, MIN_STRIKE - 1, PREMIUM, _expiry(), _deadline());
    }

    function test_create_reverts_premiumTooLow() public {
        vm.prank(seller);
        vm.expectRevert(Errors.PremiumTooLow.selector);
        calls.createOffer(address(token), AMOUNT, STRIKE, Constants.MIN_PREMIUM - 1, _expiry(), _deadline());
    }

    function test_create_reverts_badDuration() public {
        uint64 now_ = uint64(block.timestamp);
        vm.startPrank(seller);
        vm.expectRevert(Errors.BadDuration.selector);
        calls.createOffer(address(token), AMOUNT, STRIKE, PREMIUM, now_ + 1 hours - 1, now_ + 60);
        vm.expectRevert(Errors.BadDuration.selector);
        calls.createOffer(address(token), AMOUNT, STRIKE, PREMIUM, now_ + 90 days + 1, now_ + 60);
        vm.expectRevert(Errors.BadDuration.selector);
        calls.createOffer(address(token), AMOUNT, STRIKE, PREMIUM, now_, now_);
        // bounds are inclusive
        calls.createOffer(address(token), AMOUNT, STRIKE, PREMIUM, now_ + 1 hours, now_ + 60);
        calls.createOffer(address(token), AMOUNT, STRIKE, PREMIUM, now_ + 90 days, now_ + 60);
        vm.stopPrank();
    }

    function test_create_reverts_badDeadline() public {
        uint64 now_ = uint64(block.timestamp);
        vm.startPrank(seller);
        vm.expectRevert(Errors.BadDeadline.selector);
        calls.createOffer(address(token), AMOUNT, STRIKE, PREMIUM, _expiry(), now_);
        vm.expectRevert(Errors.BadDeadline.selector);
        calls.createOffer(address(token), AMOUNT, STRIKE, PREMIUM, _expiry(), _expiry() + 1);
        calls.createOffer(address(token), AMOUNT, STRIKE, PREMIUM, _expiry(), _expiry());
        vm.stopPrank();
    }

    function test_create_reverts_capExceeded() public {
        vm.prank(seller);
        vm.expectRevert(Errors.CapExceeded.selector);
        calls.createOffer(address(token), CAP + 1, STRIKE, PREMIUM, _expiry(), _deadline());
    }

    function test_create_capFreedOnSettle() public {
        vm.prank(seller);
        uint256 id = calls.createOffer(address(token), CAP, STRIKE, PREMIUM, _expiry(), _deadline());
        vm.prank(seller);
        vm.expectRevert(Errors.CapExceeded.selector);
        calls.createOffer(address(token), 1, STRIKE, PREMIUM, _expiry(), _deadline());
        vm.prank(seller);
        calls.cancelUnfilled(id);
        vm.prank(seller);
        calls.createOffer(address(token), 1, STRIKE, PREMIUM, _expiry(), _deadline());
    }

    function test_create_reverts_feeOnTransfer() public {
        FeeOnTransferToken tax = new FeeOnTransferToken();
        vm.prank(timelock);
        registry.addAsset(address(tax), CAP, MIN_STRIKE);
        tax.mint(seller, AMOUNT);
        vm.startPrank(seller);
        tax.approve(address(calls), AMOUNT);
        vm.expectRevert(Errors.FeeOnTransfer.selector);
        calls.createOffer(address(tax), AMOUNT, STRIKE, PREMIUM, _expiry(), _deadline());
        vm.stopPrank();
    }

    function test_create_reverts_tooManyOpen() public {
        vm.startPrank(seller);
        for (uint256 i; i < Constants.MAX_OPEN_PER_SELLER; ++i) {
            calls.createOffer(address(token), 1, STRIKE, PREMIUM, _expiry(), _deadline());
        }
        vm.expectRevert(Errors.TooManyOpen.selector);
        calls.createOffer(address(token), 1, STRIKE, PREMIUM, _expiry(), _deadline());
        vm.stopPrank();
    }

    // ------------------------------------------------------------ buy reverts

    function test_buy_reverts_wrongStatus() public {
        uint256 id = _filledCall();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Errors.WrongStatus.selector, Status.Filled));
        calls.buy(id, PREMIUM);

        uint256 unknown = calls.idOf(999);
        vm.expectRevert(abi.encodeWithSelector(Errors.WrongStatus.selector, Status.None));
        calls.buy(unknown, PREMIUM);
    }

    function test_buy_reverts_offerExpired() public {
        uint256 id = _call();
        vm.warp(_deadline() + 1);
        vm.prank(buyer);
        vm.expectRevert(Errors.OfferExpired.selector);
        calls.buy(id, PREMIUM);
    }

    function test_buy_atDeadline_ok() public {
        uint256 id = _call();
        vm.warp(_deadline());
        vm.prank(buyer);
        calls.buy(id, PREMIUM);
    }

    function test_buy_reverts_selfTrade() public {
        uint256 id = _call();
        vm.prank(seller);
        vm.expectRevert(Errors.SelfTrade.selector);
        calls.buy(id, PREMIUM);
    }

    function test_buy_reverts_premiumAboveMax() public {
        uint256 id = _call();
        vm.prank(buyer);
        vm.expectRevert(Errors.PremiumAboveMax.selector);
        calls.buy(id, PREMIUM - 1);
    }

    // ------------------------------------------------------------ exercise / expire / cancel reverts

    function test_exercise_reverts_atExpiry() public {
        uint256 id = _filledCall();
        vm.warp(_expiry());
        vm.prank(buyer);
        vm.expectRevert(Errors.OptionExpired.selector);
        calls.exercise(id);
    }

    function test_expire_reverts_beforeExpiry() public {
        uint256 id = _filledCall();
        vm.warp(_expiry() - 1);
        vm.expectRevert(Errors.NotExpired.selector);
        calls.expire(id);
    }

    function test_expire_reverts_wrongStatus() public {
        uint256 id = _call();
        vm.warp(_expiry());
        vm.expectRevert(abi.encodeWithSelector(Errors.WrongStatus.selector, Status.Open));
        calls.expire(id);
    }

    function test_cancel_reverts() public {
        uint256 id = _call();
        vm.prank(stranger);
        vm.expectRevert(Errors.NotSeller.selector);
        calls.cancelUnfilled(id);

        vm.prank(buyer);
        calls.buy(id, PREMIUM);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(Errors.WrongStatus.selector, Status.Filled));
        calls.cancelUnfilled(id);
    }

    function test_noDoubleSettlement() public {
        uint256 id = _filledCall();
        vm.prank(buyer);
        calls.exercise(id);
        vm.warp(_expiry());
        vm.expectRevert(abi.encodeWithSelector(Errors.WrongStatus.selector, Status.Exercised));
        calls.expire(id);
    }

    function test_expireMany_skipsInvalid() public {
        uint256 a = _filledCall();
        uint256 b = _call(); // open, can't expire
        uint256 c = _filledCall();
        vm.warp(_expiry());
        uint256[] memory ids = new uint256[](4);
        (ids[0], ids[1], ids[2], ids[3]) = (a, b, c, calls.idOf(12345));
        assertEq(calls.expireMany(ids), 2);
        assertEq(uint8(calls.getPosition(b).status), uint8(Status.Open));
    }

    function test_expireMany_reverts_batchTooLarge() public {
        uint256[] memory ids = new uint256[](Constants.MAX_BATCH + 1);
        vm.expectRevert(Errors.BatchTooLarge.selector);
        calls.expireMany(ids);
    }

    // ------------------------------------------------------------ router paths

    function test_router_buyForAndExerciseFor() public {
        uint256 id = _call();
        vm.prank(router);
        calls.buyFor(id, PREMIUM, buyer);
        assertEq(nft.ownerOf(id), buyer);

        uint256 tokensBefore = token.balanceOf(buyer);
        vm.prank(router);
        calls.exerciseFor(id, buyer);
        assertEq(token.balanceOf(buyer), tokensBefore + AMOUNT);
    }

    function test_router_cannotExerciseForNonHolder() public {
        uint256 id = _filledCall();
        vm.prank(router);
        vm.expectRevert(Errors.NotHolder.selector);
        calls.exerciseFor(id, stranger);
    }

    function test_routerFns_onlyRouter() public {
        uint256 id = _call();
        vm.prank(stranger);
        vm.expectRevert(Errors.NotRouter.selector);
        calls.buyFor(id, PREMIUM, stranger);
        vm.prank(stranger);
        vm.expectRevert(Errors.NotRouter.selector);
        calls.exerciseFor(id, stranger);

        vm.prank(timelock);
        calls.setRouter(address(0));
        vm.prank(address(0));
        vm.expectRevert(Errors.NotRouter.selector);
        calls.buyFor(id, PREMIUM, buyer);
    }

    // ------------------------------------------------------------ fuzz

    /// Invariant 5: premium == sellerReceived + fee, strike == sellerReceived + fee, exactly.
    function testFuzz_feeConservation(uint256 premium, uint256 strike, uint32 feeP, uint16 feeE) public {
        premium = bound(premium, Constants.MIN_PREMIUM, 100_000 ether);
        strike = bound(strike, MIN_STRIKE, 100_000 ether);
        feeP = uint32(bound(feeP, 0, Constants.MAX_FEE_BPS_PREMIUM));
        feeE = uint16(bound(feeE, 0, Constants.MAX_FEE_BPS_EXERCISE));
        vm.prank(timelock);
        calls.setFees(feeP, feeE);
        weth.mint(buyer, premium + strike);

        vm.prank(seller);
        uint256 id = calls.createOffer(address(token), AMOUNT, strike, premium, _expiry(), _deadline());
        uint256 s0 = weth.balanceOf(seller);
        vm.prank(buyer);
        calls.buy(id, premium);
        uint256 s1 = weth.balanceOf(seller);
        uint256 v1 = weth.balanceOf(address(vault));
        assertEq((s1 - s0) + v1, premium);

        vm.prank(buyer);
        calls.exercise(id);
        assertEq((weth.balanceOf(seller) - s1) + (weth.balanceOf(address(vault)) - v1), strike);
    }

    /// Exercise and expire can never both succeed, at any time around expiry.
    function testFuzz_exerciseXorExpire(int256 offset) public {
        offset = bound(offset, -10, 10);
        uint256 id = _filledCall();
        vm.warp(uint256(int256(uint256(_expiry())) + offset));
        uint64 expiry = calls.getPosition(id).expiry;

        vm.prank(buyer);
        (bool exercised,) = address(calls).call(abi.encodeCall(calls.exercise, (id)));
        (bool expired,) = address(calls).call(abi.encodeCall(calls.expire, (id)));
        assertTrue(exercised != expired);
        assertEq(exercised, block.timestamp < expiry);
    }

    function testFuzz_decimals(uint8 dec, uint256 amount) public {
        dec = uint8(bound(dec, 0, 24));
        amount = bound(amount, 1, 1e30);
        MockERC20 t = new MockERC20("Local", "LOC", dec);
        vm.prank(timelock);
        registry.addAsset(address(t), type(uint256).max, MIN_STRIKE);
        t.mint(seller, amount);
        vm.startPrank(seller);
        t.approve(address(calls), amount);
        uint256 id = calls.createOffer(address(t), amount, STRIKE, PREMIUM, _expiry(), _deadline());
        vm.stopPrank();
        vm.prank(buyer);
        calls.buy(id, PREMIUM);
        vm.prank(buyer);
        calls.exercise(id);
        assertEq(t.balanceOf(buyer), amount);
        assertEq(calls.locked(address(t)), 0);
    }
}
