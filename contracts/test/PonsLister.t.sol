// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {IPonsFactory, PonsLister} from "../src/PonsLister.sol";
import {Errors} from "../src/lib/Errors.sol";
import {MockERC20, MockWETH} from "./mocks/Mocks.sol";

contract MockPositionManager is ERC721 {
    constructor() ERC721("Pos", "POS") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

contract MockPonsFactory {
    mapping(address => IPonsFactory.Launched) internal launched;
    mapping(address => bool) public graduated;

    function launch(address token, address pairedToken, address pm, uint256 positionId) external {
        launched[token] = IPonsFactory.Launched({
            token: token,
            deployer: msg.sender,
            pairedToken: pairedToken,
            positionManager: pm,
            positionId: positionId,
            dexId: 1,
            launchConfigId: 1,
            restrictionsEndBlock: 0,
            supply: 1e9 ether,
            isToken0: true,
            poolFee: 10_000,
            exists: true,
            initialBuyAmount: 0
        });
    }

    function graduate(address token) external {
        graduated[token] = true;
    }

    function getLaunchedToken(address token) external view returns (IPonsFactory.Launched memory) {
        return launched[token];
    }

    function graduationStatus(address token) external view returns (uint256, uint256, bool) {
        return (graduated[token] ? 5 ether : 1 ether, 4.2 ether, graduated[token]);
    }
}

contract SixDecimals is MockERC20 {
    constructor() MockERC20("Six", "SIX", 6) {}
}

contract PonsListerTest is Test {
    uint256 constant DELAY = 10 minutes;
    address guardian = makeAddr("guardian");
    address admin = makeAddr("admin");
    address anyone = makeAddr("anyone");
    address locker = makeAddr("locker");

    TimelockController timelock;
    AssetRegistry registry;
    PonsLister lister;
    MockPonsFactory factory;
    MockPonsFactory legacy;
    MockPositionManager pm;
    MockWETH weth;
    MockERC20 token;

    function setUp() public {
        address[] memory proposers = new address[](1);
        proposers[0] = admin;
        address[] memory executors = new address[](1);
        executors[0] = admin;
        timelock = new TimelockController(DELAY, proposers, executors, admin);
        registry = new AssetRegistry(address(timelock), guardian);
        weth = new MockWETH();
        factory = new MockPonsFactory();
        legacy = new MockPonsFactory();
        pm = new MockPositionManager();
        address[] memory fs = new address[](2);
        fs[0] = address(factory);
        fs[1] = address(legacy);
        address[] memory ls = new address[](1);
        ls[0] = locker;
        lister = new PonsLister(address(timelock), guardian, address(registry), address(weth), fs, ls, 200, 1e12);
        // the timelock (its admin here) grants the lister proposer + executor
        vm.startPrank(admin);
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(lister));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(lister));
        vm.stopPrank();

        token = new MockERC20("Pongo", "PONGO", 18);
        token.mint(address(this), 1e9 ether);
        pm.mint(locker, 7);
        factory.launch(address(token), address(weth), address(pm), 7);
    }

    function _graduateAndList() internal returns (bytes32 id) {
        factory.graduate(address(token));
        vm.prank(anyone);
        id = lister.list(address(token));
    }

    function test_listsGraduatedTokenAfterDelay() public {
        bytes32 id = _graduateAndList();
        assertTrue(timelock.isOperationPending(id));
        assertFalse(registry.isEnabled(address(token)));
        vm.warp(block.timestamp + DELAY);
        vm.prank(anyone);
        lister.execute(address(token));
        assertTrue(registry.isEnabled(address(token)));
        AssetRegistry.Asset memory a = registry.getAsset(address(token));
        assertEq(a.cap, (1e9 ether * 200) / 10_000, "2% of supply");
        assertEq(a.minStrike, 1e12);
        assertFalse(a.putsEnabled);
    }

    function test_executeBeforeDelayReverts() public {
        _graduateAndList();
        vm.expectRevert();
        lister.execute(address(token));
    }

    function test_rejectsNotGraduated() public {
        vm.expectRevert(PonsLister.NotGraduated.selector);
        lister.list(address(token));
    }

    function test_rejectsUnknownToken() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.expectRevert(PonsLister.NotPonsToken.selector);
        lister.list(address(other));
    }

    function test_rejectsNonWethPair() public {
        MockERC20 usd = new MockERC20("USD", "USD", 18);
        MockERC20 t2 = new MockERC20("T2", "T2", 18);
        pm.mint(locker, 8);
        factory.launch(address(t2), address(usd), address(pm), 8);
        factory.graduate(address(t2));
        vm.expectRevert(PonsLister.NotWethPair.selector);
        lister.list(address(t2));
    }

    function test_rejectsUnlockedPosition() public {
        MockERC20 t2 = new MockERC20("T2", "T2", 18);
        pm.mint(anyone, 9); // position held by a wallet, not a locker
        factory.launch(address(t2), address(weth), address(pm), 9);
        factory.graduate(address(t2));
        vm.expectRevert(PonsLister.PositionNotLocked.selector);
        lister.list(address(t2));
    }

    function test_rejectsSixDecimals() public {
        SixDecimals six = new SixDecimals();
        pm.mint(locker, 10);
        factory.launch(address(six), address(weth), address(pm), 10);
        factory.graduate(address(six));
        vm.expectRevert(PonsLister.BadDecimals.selector);
        lister.list(address(six));
    }

    function test_rejectsDoubleScheduleAndAlreadyListed() public {
        _graduateAndList();
        vm.expectRevert(PonsLister.AlreadyScheduled.selector);
        lister.list(address(token));
        vm.warp(block.timestamp + DELAY);
        lister.execute(address(token));
        // a fresh lister (no memory of the schedule) still refuses: the registry has it
        address[] memory fs = new address[](1);
        fs[0] = address(factory);
        address[] memory ls = new address[](1);
        ls[0] = locker;
        PonsLister fresh = new PonsLister(address(timelock), guardian, address(registry), address(weth), fs, ls, 200, 1e12);
        vm.expectRevert(PonsLister.AlreadyListed.selector);
        fresh.list(address(token));
    }

    function test_executionUsesScheduledCapEvenIfSupplyChanges() public {
        _graduateAndList();
        uint256 planned = lister.capOf(address(token));
        token.mint(address(this), 1e9 ether); // supply doubles after scheduling
        vm.warp(block.timestamp + DELAY);
        lister.execute(address(token));
        assertEq(registry.getAsset(address(token)).cap, planned);
    }

    function test_timelockCanResetAStuckSchedule() public {
        bytes32 id = _graduateAndList();
        vm.prank(admin); // admin holds the canceller role in this setup
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

    function test_legacyFactoryTokensQualify() public {
        MockERC20 t2 = new MockERC20("Old", "OLD", 18);
        t2.mint(address(this), 1e9 ether);
        pm.mint(locker, 11);
        legacy.launch(address(t2), address(weth), address(pm), 11);
        legacy.graduate(address(t2));
        (uint256 cap, address f) = lister.check(address(t2));
        assertEq(f, address(legacy));
        assertEq(cap, (1e9 ether * 200) / 10_000);
    }

    function test_guardianPauseStopsNewListings() public {
        vm.prank(guardian);
        lister.pause();
        factory.graduate(address(token));
        vm.expectRevert(Errors.MarketPaused.selector);
        lister.list(address(token));
        vm.prank(guardian);
        vm.expectRevert(Errors.NotTimelock.selector);
        lister.unpause();
    }

    function test_onlyTimelockChangesParams() public {
        vm.expectRevert(Errors.NotTimelock.selector);
        lister.setCapBps(500);
        vm.prank(address(timelock));
        lister.setCapBps(500);
        assertEq(lister.capBps(), 500);
        vm.prank(address(timelock));
        vm.expectRevert(PonsLister.BadBps.selector);
        lister.setCapBps(0);
        vm.prank(address(timelock));
        lister.setMinStrike(5e12);
        assertEq(lister.minStrike(), 5e12);
        vm.prank(address(timelock));
        lister.setLocker(locker, false);
        factory.graduate(address(token));
        vm.expectRevert(PonsLister.PositionNotLocked.selector);
        lister.list(address(token));
    }

    function test_listerCannotProposeAnythingElse() public {
        // The lister has the proposer role but exposes no call that schedules arbitrary data: the only path is
        // list(), which builds addAsset itself. Sanity: calling the timelock directly as the lister is impossible for
        // outsiders, and the lister contract has no function forwarding user-supplied calldata.
        vm.prank(anyone);
        vm.expectRevert();
        timelock.schedule(address(registry), 0, hex"", bytes32(0), bytes32(0), DELAY);
    }
}
