// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {FoboLister, IFoboHook} from "../src/FoboLister.sol";
import {Errors} from "../src/lib/Errors.sol";
import {MockERC20} from "./mocks/Mocks.sol";

/// @dev The slice of FoboHook the lister reads: keyFor, the pools getter (15 fields, like the real one) and floorOf.
contract MockFoboHook {
    struct Pool {
        address token;
        address creator;
        uint40 launchedAt;
        int24 tickStart;
        int24 tickF;
        int24 refTick;
        uint64 refBlock;
        uint64 lastRaiseBlock;
        uint128 snipePot;
        uint128 snipeReleased;
        uint8 merged;
        uint128 liqBand;
        uint256 pot;
        uint256 creatorOwed;
        uint256 reserve;
    }

    mapping(bytes32 => Pool) public pools;
    mapping(address => uint160) public sqrtOf;
    mapping(address => uint256) public circulatingOf;

    function keyFor(address quote, address token) public view returns (IFoboHook.PoolKey memory) {
        return IFoboHook.PoolKey({currency0: quote, currency1: token, fee: 0, tickSpacing: 60, hooks: address(this)});
    }

    function launch(address token, uint40 launchedAt, uint160 sqrtPriceX96, uint256 circulating) external {
        bytes32 id = keccak256(abi.encode(keyFor(address(0), token)));
        pools[id].token = token;
        pools[id].creator = msg.sender;
        pools[id].launchedAt = launchedAt;
        sqrtOf[token] = sqrtPriceX96;
        circulatingOf[token] = circulating;
    }

    function setFloor(address token, uint160 sqrtPriceX96, uint256 circulating) external {
        sqrtOf[token] = sqrtPriceX96;
        circulatingOf[token] = circulating;
    }

    function floorOf(IFoboHook.PoolKey calldata key) external view returns (int24, uint160, uint256) {
        return (0, sqrtOf[key.currency1], circulatingOf[key.currency1]);
    }
}

contract SixDecimalsF is MockERC20 {
    constructor() MockERC20("Six", "SIX", 6) {}
}

contract FoboListerTest is Test {
    uint256 constant DELAY = 10 minutes;
    uint256 constant Q96 = 1 << 96;
    address guardian = makeAddr("guardian");
    address admin = makeAddr("admin");
    address anyone = makeAddr("anyone");

    TimelockController timelock;
    AssetRegistry registry;
    FoboLister lister;
    MockFoboHook hook;
    MockERC20 token;
    uint40 launchedAt;

    // A floor at 1e-6 ETH per token: token per ETH = 1e6, sqrt = 1e3, in Q96. 1e7 tokens outside the pool back 10 ETH.
    uint160 constant SQRT_1E6 = uint160(1000 * Q96);
    uint256 constant CIRC_10_ETH = 10_000_000 ether;

    function setUp() public {
        address[] memory proposers = new address[](1);
        proposers[0] = admin;
        address[] memory executors = new address[](1);
        executors[0] = admin;
        timelock = new TimelockController(DELAY, proposers, executors, admin);
        registry = new AssetRegistry(address(timelock), guardian);
        hook = new MockFoboHook();
        lister = new FoboLister(
            address(timelock), guardian, address(registry), address(hook), 200, 1e12, 1 days, 4.2 ether, true
        );
        vm.startPrank(admin);
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(lister));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(lister));
        vm.stopPrank();

        vm.warp(10 days);
        token = new MockERC20("Moose", "MOOSE", 18);
        token.mint(address(this), 1e9 ether);
        launchedAt = uint40(block.timestamp - 2 days);
        hook.launch(address(token), launchedAt, SQRT_1E6, CIRC_10_ETH);
    }

    function _list() internal returns (bytes32 id) {
        vm.prank(anyone);
        id = lister.list(address(token));
    }

    function test_floorBackingMath() public view {
        // 1e7 tokens at a floor of 1e-6 ETH each = 10 ETH
        assertEq(lister.floorBacking(SQRT_1E6, CIRC_10_ETH), 10 ether);
        // half the circulating, half the backing
        assertEq(lister.floorBacking(SQRT_1E6, CIRC_10_ETH / 2), 5 ether);
        // a zero price backs nothing (and does not divide by zero)
        assertEq(lister.floorBacking(0, CIRC_10_ETH), 0);
        // a real-world magnitude: sqrtP ~ 2^96 * 3e4 (token per ETH 9e8), 6.6e8 tokens -> ~0.73 ETH
        uint160 sp = uint160(30_000 * Q96);
        uint256 b = lister.floorBacking(sp, 661_748_294 ether);
        assertApproxEqRel(b, 0.7353 ether, 1e15);
    }

    function test_listsAfterDelayWithPutsOn() public {
        bytes32 id = _list();
        assertTrue(timelock.isOperationPending(id));
        assertFalse(registry.isEnabled(address(token)));
        vm.warp(block.timestamp + DELAY);
        vm.prank(anyone);
        lister.execute(address(token));
        assertTrue(registry.isEnabled(address(token)));
        AssetRegistry.Asset memory a = registry.getAsset(address(token));
        assertEq(a.cap, (1e9 ether * 200) / 10_000, "2% of supply");
        assertEq(a.minStrike, 1e12);
        assertTrue(a.putsEnabled, "puts on by default: the floor bounds the writer");
    }

    function test_putsOffWhenConfigured() public {
        vm.prank(address(timelock));
        lister.setPutsOn(false);
        _list();
        vm.warp(block.timestamp + DELAY);
        lister.execute(address(token));
        assertFalse(registry.getAsset(address(token)).putsEnabled);
    }

    function test_executeBeforeDelayReverts() public {
        _list();
        vm.expectRevert();
        lister.execute(address(token));
    }

    function test_rejectsUnknownToken() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.expectRevert(FoboLister.NotFoboToken.selector);
        lister.list(address(other));
    }

    function test_rejectsTooYoung() public {
        MockERC20 t2 = new MockERC20("Young", "YNG", 18);
        t2.mint(address(this), 1e9 ether);
        hook.launch(address(t2), uint40(block.timestamp - 23 hours), SQRT_1E6, CIRC_10_ETH);
        vm.expectRevert(FoboLister.TooYoung.selector);
        lister.list(address(t2));
        vm.warp(block.timestamp + 1 hours);
        (uint256 cap,) = lister.check(address(t2));
        assertGt(cap, 0);
    }

    function test_rejectsLowFloor() public {
        hook.setFloor(address(token), SQRT_1E6, 4_000_000 ether); // 4 ETH backed, bar is 4.2
        vm.expectRevert(FoboLister.FloorTooLow.selector);
        lister.list(address(token));
        hook.setFloor(address(token), SQRT_1E6, 4_200_000 ether); // exactly the bar passes
        (, uint256 fq) = lister.check(address(token));
        assertEq(fq, 4.2 ether);
    }

    function test_rejectsSixDecimals() public {
        SixDecimalsF six = new SixDecimalsF();
        six.mint(address(this), 1e9 * 1e6);
        hook.launch(address(six), launchedAt, SQRT_1E6, CIRC_10_ETH);
        vm.expectRevert(FoboLister.BadDecimals.selector);
        lister.list(address(six));
    }

    function test_rejectsDoubleScheduleAndAlreadyListed() public {
        _list();
        vm.expectRevert(FoboLister.AlreadyScheduled.selector);
        lister.list(address(token));
        vm.warp(block.timestamp + DELAY);
        lister.execute(address(token));
        FoboLister fresh = new FoboLister(
            address(timelock), guardian, address(registry), address(hook), 200, 1e12, 1 days, 4.2 ether, true
        );
        vm.expectRevert(FoboLister.AlreadyListed.selector);
        fresh.list(address(token));
    }

    function test_executionUsesScheduledTermsEvenIfTheyChange() public {
        _list();
        uint256 planned = lister.capOf(address(token));
        token.mint(address(this), 1e9 ether); // supply doubles
        vm.startPrank(address(timelock));
        lister.setPutsOn(false);
        lister.setMinStrike(5e12);
        vm.stopPrank();
        vm.warp(block.timestamp + DELAY);
        lister.execute(address(token));
        AssetRegistry.Asset memory a = registry.getAsset(address(token));
        assertEq(a.cap, planned);
        assertEq(a.minStrike, 1e12);
        assertTrue(a.putsEnabled);
    }

    function test_floorMayDropBelowBarAfterScheduling() public {
        // the bar is checked at list(); execute() replays the scheduled operation regardless (the timelock delay is
        // the review window, and the guardian can disable the asset after listing)
        _list();
        hook.setFloor(address(token), SQRT_1E6, 1 ether);
        vm.warp(block.timestamp + DELAY);
        lister.execute(address(token));
        assertTrue(registry.isEnabled(address(token)));
    }

    function test_timelockCanResetAStuckSchedule() public {
        bytes32 id = _list();
        vm.prank(admin);
        timelock.cancel(id);
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert();
        lister.execute(address(token));
        vm.expectRevert(Errors.NotTimelock.selector);
        lister.reset(address(token));
        vm.prank(address(timelock));
        lister.reset(address(token));
        bytes32 id2 = lister.list(address(token));
        assertTrue(id2 != id);
    }

    function test_guardianPauseStopsNewListings() public {
        vm.prank(guardian);
        lister.pause();
        vm.expectRevert(Errors.MarketPaused.selector);
        lister.list(address(token));
        vm.prank(guardian);
        vm.expectRevert(Errors.NotTimelock.selector);
        lister.unpause();
    }

    function test_onlyTimelockChangesParams() public {
        vm.expectRevert(Errors.NotTimelock.selector);
        lister.setCapBps(500);
        vm.expectRevert(Errors.NotTimelock.selector);
        lister.setMinAge(1);
        vm.expectRevert(Errors.NotTimelock.selector);
        lister.setMinFloorQuote(1);
        vm.expectRevert(Errors.NotTimelock.selector);
        lister.setPutsOn(false);
        vm.startPrank(address(timelock));
        lister.setCapBps(500);
        assertEq(lister.capBps(), 500);
        vm.expectRevert(FoboLister.BadBps.selector);
        lister.setCapBps(0);
        lister.setMinAge(3 days);
        lister.setMinFloorQuote(100 ether);
        vm.stopPrank();
        vm.expectRevert(FoboLister.TooYoung.selector);
        lister.list(address(token));
        vm.prank(address(timelock));
        lister.setMinAge(1 days);
        vm.expectRevert(FoboLister.FloorTooLow.selector);
        lister.list(address(token));
    }

    function test_rejectsRegistryFullAtExecute_resetRecovers() public {
        // the registry check is the timelock's: a full registry reverts execute, the lister's reset clears the slot
        bytes32 id = _list();
        vm.warp(block.timestamp + DELAY);
        vm.mockCallRevert(
            address(registry),
            abi.encodeWithSignature("addAssets(address[],uint256[],uint256[],bool)"),
            abi.encodeWithSelector(Errors.TooManyAssets.selector)
        );
        vm.expectRevert();
        lister.execute(address(token));
        vm.clearMockedCalls();
        assertEq(lister.operationOf(address(token)), id);
        lister.execute(address(token)); // still pending in the timelock: runs once the registry has room
        assertTrue(registry.isEnabled(address(token)));
    }

    function test_listerCannotProposeAnythingElse() public {
        vm.prank(anyone);
        vm.expectRevert();
        timelock.schedule(address(registry), 0, hex"", bytes32(0), bytes32(0), DELAY);
    }
}
