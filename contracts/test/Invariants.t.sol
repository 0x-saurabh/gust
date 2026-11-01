// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BaseTest} from "./Base.t.sol";
import {CallMarket} from "../src/CallMarket.sol";
import {OptionNFT} from "../src/OptionNFT.sol";
import {PutMarket} from "../src/PutMarket.sol";
import {Router} from "../src/Router.sol";
import {IWETH} from "../src/interfaces/IWETH.sol";
import {OptionMarketBase} from "../src/OptionMarketBase.sol";
import {Position, Status} from "../src/lib/Types.sol";
import {MockERC20, MockWETH} from "./mocks/Mocks.sol";

/// @dev Drives random sequences of every user action across both markets.
contract Handler is Test {
    CallMarket internal calls;
    PutMarket internal puts;
    OptionNFT internal nft;
    MockERC20 internal token;
    MockWETH internal weth;
    Router internal router;

    address[] internal actors;
    uint256[] public ids;
    mapping(uint256 id => Status) public lastStatus;
    bool public statusWentBackwards;

    constructor(CallMarket c, PutMarket p, OptionNFT n, MockERC20 t, MockWETH w, Router r) {
        (calls, puts, nft, token, weth, router) = (c, p, n, t, w, r);
        for (uint256 i; i < 4; ++i) {
            address a = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(a);
            token.mint(a, 1e30);
            weth.mint(a, 1e30);
            vm.deal(a, 1e30);
            vm.startPrank(a);
            token.approve(address(calls), type(uint256).max);
            token.approve(address(puts), type(uint256).max);
            weth.approve(address(calls), type(uint256).max);
            weth.approve(address(puts), type(uint256).max);
            vm.stopPrank();
        }
    }

    function routerAddr() external view returns (address) {
        return address(router);
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function create(uint256 actorSeed, bool isPut, uint256 amount, uint256 strike, uint256 premium, uint256 dur)
        external
    {
        address a = actors[actorSeed % actors.length];
        amount = bound(amount, 1, 1e24);
        strike = bound(strike, 0.001 ether, 1_000 ether);
        premium = bound(premium, 0.0005 ether, 10 ether);
        dur = bound(dur, 1 hours, 90 days);
        uint64 expiry = uint64(block.timestamp + dur);
        uint64 deadline = uint64(block.timestamp + bound(dur, 1, dur));
        vm.prank(a);
        uint256 id = isPut
            ? puts.createPutOffer(address(token), amount, strike, premium, expiry, deadline)
            : calls.createOffer(address(token), amount, strike, premium, expiry, deadline);
        ids.push(id);
        _track(id);
    }

    function buy(uint256 actorSeed, uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        vm.prank(actors[actorSeed % actors.length]);
        try _market(id).buy(id, type(uint256).max) {} catch {}
        _track(id);
    }

    function buyWithEth(uint256 actorSeed, uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        uint256 premium = _market(id).getPosition(id).premium;
        vm.prank(actors[actorSeed % actors.length]);
        if (id >> 248 == 1) {
            try router.buyWithETH{value: premium + 1}(id, type(uint256).max) {} catch {}
        } else {
            try router.buyPutWithETH{value: premium + 1}(id, type(uint256).max) {} catch {}
        }
        _track(id);
    }

    function exerciseWithEth(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        if (id >> 248 != 1) return;
        address holder;
        try nft.ownerOf(id) returns (address h) {
            holder = h;
        } catch {
            return;
        }
        uint256 strike = calls.getPosition(id).strike;
        vm.deal(holder, strike + 1);
        vm.prank(holder);
        try router.exerciseWithETH{value: strike + 1}(id) {} catch {}
        _track(id);
    }

    function exercise(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        address holder;
        try nft.ownerOf(id) returns (address h) {
            holder = h;
        } catch {
            return;
        }
        vm.prank(holder);
        if (id >> 248 == 1) {
            try calls.exercise(id) {} catch {}
        } else {
            try puts.exercisePut(id) {} catch {}
        }
        _track(id);
    }

    function expire(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        try _market(id).expire(id) {} catch {}
        _track(id);
    }

    function cancel(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        vm.prank(_market(id).getPosition(id).seller);
        try _market(id).cancelUnfilled(id) {} catch {}
        _track(id);
    }

    function transferNft(uint256 idSeed, uint256 toSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        try nft.ownerOf(id) returns (address h) {
            vm.prank(h);
            nft.transferFrom(h, actors[toSeed % actors.length], id);
        } catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 10 days));
    }

    function _market(uint256 id) internal view returns (OptionMarketBase) {
        return id >> 248 == 1 ? OptionMarketBase(address(calls)) : OptionMarketBase(address(puts));
    }

    function _track(uint256 id) internal {
        Status s = _market(id).getPosition(id).status;
        Status prev = lastStatus[id];
        bool ok = s == prev || (prev == Status.None && s == Status.Open)
            || (prev == Status.Open && (s == Status.Filled || s == Status.Cancelled))
            || (prev == Status.Filled && (s == Status.Exercised || s == Status.Expired));
        if (!ok) statusWentBackwards = true;
        lastStatus[id] = s;
    }
}

contract InvariantsTest is BaseTest {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        vm.prank(timelock);
        registry.setCap(address(token), type(uint256).max);
        Router r = new Router(IWETH(address(weth)), calls, puts);
        vm.startPrank(timelock);
        calls.setRouter(address(r));
        puts.setRouter(address(r));
        vm.stopPrank();
        handler = new Handler(calls, puts, nft, token, weth, r);
        targetContract(address(handler));
    }

    /// 1. Call escrow covers every open/filled position, and the ledger matches the positions.
    function invariant_callCollateral() public view {
        uint256 sum = _sumLive(true);
        assertEq(calls.locked(address(token)), sum);
        assertGe(token.balanceOf(address(calls)), sum);
    }

    /// 2. Put escrow covers every open/filled strike.
    function invariant_putCollateral() public view {
        uint256 sum = _sumLive(false);
        assertEq(puts.locked(address(weth)), sum);
        assertGe(weth.balanceOf(address(puts)), sum);
    }

    /// 3. Status only moves forward.
    function invariant_statusMonotonic() public view {
        assertFalse(handler.statusWentBackwards());
    }

    /// 4. An NFT exists if and only if the position is Filled.
    function invariant_nftIffFilled() public view {
        uint256 n = handler.idCount();
        for (uint256 i; i < n; ++i) {
            uint256 id = handler.ids(i);
            Position memory p = _get(id);
            bool exists;
            try nft.ownerOf(id) returns (address) {
                exists = true;
            } catch {}
            assertEq(exists, p.status == Status.Filled);
        }
    }

    /// Router never holds a balance.
    function invariant_routerEmpty() public view {
        assertEq(weth.balanceOf(address(handler.routerAddr())), 0);
        assertEq(address(handler.routerAddr()).balance, 0);
    }

    function _sumLive(bool isCall) internal view returns (uint256 sum) {
        uint256 n = handler.idCount();
        for (uint256 i; i < n; ++i) {
            uint256 id = handler.ids(i);
            if ((id >> 248 == 1) != isCall) continue;
            Position memory p = _get(id);
            if (p.status == Status.Open || p.status == Status.Filled) sum += isCall ? p.amount : p.strike;
        }
    }

    function _get(uint256 id) internal view returns (Position memory) {
        return id >> 248 == 1 ? calls.getPosition(id) : puts.getPosition(id);
    }
}
