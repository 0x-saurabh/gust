// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {CallMarket} from "../src/CallMarket.sol";
import {OptionNFT} from "../src/OptionNFT.sol";
import {PutMarket} from "../src/PutMarket.sol";
import {Router} from "../src/Router.sol";
import {IAssetRegistry} from "../src/interfaces/IAssetRegistry.sol";
import {IOptionNFT} from "../src/interfaces/IOptionNFT.sol";
import {IWETH} from "../src/interfaces/IWETH.sol";

/// @notice Markets v2 against the real Robinhood Stock Tokens on a Robinhood Chain mainnet fork: list AAPL and NVDA
/// in one batch, then a full covered call (AAPL) and cash-secured put (NVDA) lifecycle with real WETH.
/// Runs only with FORK=1 (needs the network):  FORK=1 forge test --match-contract ForkRobinhoodStocks -vv
contract ForkRobinhoodStocksTest is Test {
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant FEE_VAULT = 0x78c569A1137B78cB78F42c42B4B6C2b8F1E3dDef; // live v1 FeeVault, reused by v2

    address timelock = makeAddr("timelock");
    address guardian = makeAddr("guardian");
    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");

    AssetRegistry registry;
    CallMarket calls;
    PutMarket puts;
    Router router;
    bool on;

    function setUp() public {
        on = vm.envOr("FORK", uint256(0)) == 1;
        if (!on) return;
        vm.createSelectFork("robinhood");
        registry = new AssetRegistry(timelock, guardian);
        OptionNFT nft = new OptionNFT();
        calls = new CallMarket(
            IAssetRegistry(address(registry)),
            IOptionNFT(address(nft)),
            IERC20(WETH),
            FEE_VAULT,
            timelock,
            guardian,
            300,
            10
        );
        puts = new PutMarket(
            IAssetRegistry(address(registry)),
            IOptionNFT(address(nft)),
            IERC20(WETH),
            FEE_VAULT,
            timelock,
            guardian,
            300,
            10
        );
        nft.setMarkets(address(calls), address(puts));
        router = new Router(IWETH(WETH), calls, puts);

        address[] memory toks = new address[](2);
        uint256[] memory caps = new uint256[](2);
        uint256[] memory mins = new uint256[](2);
        (toks[0], toks[1]) = (AAPL, NVDA);
        (caps[0], caps[1]) = (150e18, 250e18);
        (mins[0], mins[1]) = (0.0001 ether, 0.0001 ether);
        vm.startPrank(timelock);
        registry.addAssets(toks, caps, mins, true);
        calls.setRouter(address(router));
        puts.setRouter(address(router));
        vm.stopPrank();
        vm.deal(seller, 10 ether);
        vm.deal(buyer, 10 ether);
    }

    function test_coveredCall_AAPL() public {
        if (!on) return;
        deal(AAPL, seller, 2e18);
        uint64 expiry = uint64(block.timestamp + 1 days);
        vm.startPrank(seller);
        IERC20(AAPL).approve(address(calls), 1e18);
        uint256 id = calls.createOffer(AAPL, 1e18, 0.15 ether, 0.001 ether, expiry, uint64(block.timestamp + 1 hours));
        vm.stopPrank();
        assertEq(IERC20(AAPL).balanceOf(address(calls)), 1e18, "AAPL escrowed");
        assertEq(id >> 248, 3, "v2 call tag");

        vm.startPrank(buyer);
        router.buyWithETH{value: 0.001 ether}(id, 0.001 ether);
        router.exerciseWithETH{value: 0.15 ether}(id);
        vm.stopPrank();
        assertEq(IERC20(AAPL).balanceOf(buyer), 1e18, "buyer got AAPL");
        assertGt(IERC20(WETH).balanceOf(seller), 0.15 ether, "seller got strike + premium");
    }

    function test_cashSecuredPut_NVDA() public {
        if (!on) return;
        uint64 expiry = uint64(block.timestamp + 1 days);
        vm.prank(seller);
        uint256 id = router.createPutOfferWithETH{value: 0.09 ether}(
            NVDA, 1e18, 0.09 ether, 0.001 ether, expiry, uint64(block.timestamp + 1 hours)
        );
        assertEq(id >> 248, 4, "v2 put tag");

        deal(NVDA, buyer, 1e18);
        vm.startPrank(buyer);
        router.buyPutWithETH{value: 0.001 ether}(id, 0.001 ether);
        IERC20(NVDA).approve(address(puts), 1e18);
        puts.exercisePut(id);
        vm.stopPrank();
        assertEq(IERC20(NVDA).balanceOf(seller), 1e18, "seller received NVDA");
        assertGt(IERC20(WETH).balanceOf(buyer), 0.08 ether, "buyer got the strike in WETH");
    }

    function test_expiredCall_returnsAAPL() public {
        if (!on) return;
        deal(AAPL, seller, 1e18);
        vm.startPrank(seller);
        IERC20(AAPL).approve(address(calls), 1e18);
        uint256 id = calls.createOffer(
            AAPL, 1e18, 0.2 ether, 0.001 ether, uint64(block.timestamp + 2 hours), uint64(block.timestamp + 1 hours)
        );
        vm.stopPrank();
        vm.prank(buyer);
        router.buyWithETH{value: 0.001 ether}(id, 0.001 ether);
        vm.warp(block.timestamp + 3 hours);
        calls.expire(id);
        assertEq(IERC20(AAPL).balanceOf(seller), 1e18, "AAPL back to seller");
    }
}
