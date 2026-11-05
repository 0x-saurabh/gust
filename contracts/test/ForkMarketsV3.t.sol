// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CallMarket} from "../src/CallMarket.sol";
import {OptionNFT} from "../src/OptionNFT.sol";
import {PutMarket} from "../src/PutMarket.sol";
import {Router} from "../src/Router.sol";
import {IAssetRegistry} from "../src/interfaces/IAssetRegistry.sol";
import {IOptionNFT} from "../src/interfaces/IOptionNFT.sol";
import {IWETH} from "../src/interfaces/IWETH.sol";
import {Constants} from "../src/lib/Constants.sol";

/// @notice Markets v3 exactly as DeployMarketsV3 builds them, on a Robinhood Chain mainnet fork: the LIVE v2
/// AssetRegistry (no new listings), live timelock, guardian, FeeVault and WETH. Stock tokens and crypto tokens
/// trade, the Option NFT moves with the right to exercise, and tokenURI renders the readable card.
///   FORK=1 forge test --match-contract ForkMarketsV3 -vv
contract ForkMarketsV3Test is Test {
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant FEE_VAULT = 0x78c569A1137B78cB78F42c42B4B6C2b8F1E3dDef;
    address constant TIMELOCK = 0xf8E6fAF7e0E57bc91aD5C59B84FedE2Cab842893;
    address constant GUARDIAN = 0x9F433eE8020cFb3521bDaE0DDA612932e1E90EF0;
    address constant V2_REGISTRY = 0x02f571e10B9c7303EB7A6284A7137b146e18658D;
    address constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant LINK = 0x492641F648a4986844848E0beFE66D14817bCE34;
    address constant PENGU = 0x74BE72AFFAFbC8de30F0C11247814036314D625f;

    OptionNFT nft;
    CallMarket calls;
    PutMarket puts;
    Router router;
    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");
    address friend = makeAddr("friend");
    bool on;

    function setUp() public {
        on = vm.envOr("FORK", uint256(0)) == 1;
        if (!on) return;
        vm.createSelectFork("robinhood");
        nft = new OptionNFT();
        calls = new CallMarket(
            IAssetRegistry(V2_REGISTRY), IOptionNFT(address(nft)), IERC20(WETH), FEE_VAULT, TIMELOCK, GUARDIAN, 300, 10
        );
        puts = new PutMarket(
            IAssetRegistry(V2_REGISTRY), IOptionNFT(address(nft)), IERC20(WETH), FEE_VAULT, TIMELOCK, GUARDIAN, 300, 10
        );
        nft.setMarkets(address(calls), address(puts));
        router = new Router(IWETH(WETH), calls, puts);
        vm.startPrank(TIMELOCK); // the one timelock operation pair v3-plan.mjs schedules
        calls.setRouter(address(router));
        puts.setRouter(address(router));
        vm.stopPrank();
        vm.deal(seller, 10 ether);
        vm.deal(buyer, 10 ether);
        vm.deal(friend, 10 ether);
    }

    function _call(address token, uint256 amount, uint256 strike, uint256 premium) internal returns (uint256 id) {
        deal(token, seller, amount);
        vm.startPrank(seller);
        IERC20(token).approve(address(calls), amount);
        id = calls.createOffer(
            token, amount, strike, premium, uint64(block.timestamp + 1 days), uint64(block.timestamp + 1 hours)
        );
        vm.stopPrank();
        vm.prank(buyer);
        router.buyWithETH{value: premium}(id, premium);
    }

    function test_stockCall_nftMovesWithTheRight() public {
        if (!on) return;
        uint256 id = _call(AAPL, 1e18, 0.15 ether, 0.001 ether);
        assertEq(id >> 248, 5, "v3 call tag");
        assertEq(nft.ownerOf(id), buyer);
        console2.log("AAPL_CALL_URI", nft.tokenURI(id));
        vm.prank(buyer);
        nft.transferFrom(buyer, friend, id);
        vm.prank(buyer);
        vm.expectRevert();
        router.exerciseWithETH{value: 0.15 ether}(id);
        vm.prank(friend);
        router.exerciseWithETH{value: 0.15 ether}(id);
        assertEq(IERC20(AAPL).balanceOf(friend), 1e18, "new holder got AAPL");
        vm.expectRevert();
        nft.ownerOf(id);
    }

    function test_stockPut_expiresAndBurns() public {
        if (!on) return;
        vm.prank(seller);
        uint256 id = router.createPutOfferWithETH{value: 0.09 ether}(
            NVDA, 1e18, 0.09 ether, 0.001 ether, uint64(block.timestamp + 2 hours), uint64(block.timestamp + 1 hours)
        );
        assertEq(id >> 248, Constants.PUT_TAG);
        vm.prank(buyer);
        router.buyPutWithETH{value: 0.001 ether}(id, 0.001 ether);
        console2.log("NVDA_PUT_URI", nft.tokenURI(id));
        vm.warp(block.timestamp + 3 hours);
        puts.expire(id);
        vm.expectRevert();
        nft.ownerOf(id);
    }

    function test_cryptoTokens() public {
        if (!on) return;
        uint256 l = _call(LINK, 25e18, 0.2 ether, 0.002 ether);
        console2.log("LINK_CALL_URI", nft.tokenURI(l));
        uint256 p = _call(PENGU, 250_000e18, 0.5 ether, 0.003 ether);
        console2.log("PENGU_CALL_URI", nft.tokenURI(p));
        assertEq(nft.balanceOf(buyer), 2);
    }
}
