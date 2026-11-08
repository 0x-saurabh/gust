// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {HarmonicHaltGate} from "../src/lib/harmonic/HarmonicHaltGate.sol";
import {IHarmonicOracle} from "../src/interfaces/IHarmonicOracle.sol";

contract ForkGatedDesk is HarmonicHaltGate {
    constructor(address oracle) HarmonicHaltGate(oracle, 1 days) {}

    function check(address token) external view returns (HarmonicHaltGate.GateVerdict g, uint8 v, uint64 age) {
        return gateVerdict(token);
    }
}

/// @notice The live HarmonicOracle on a Robinhood Chain mainnet fork: the row for NVDA and AAPL reads as a known
/// verdict written in the last day (a free read from an EOA), the risk feed interface answers, and a fresh contract
/// that has not paid for the seat is told so by the gate instead of being lied to.
/// Runs only with FORK=1 (needs the network):  FORK=1 forge test --match-contract ForkHarmonicOracle -vv
contract ForkHarmonicOracleTest is Test {
    address constant ORACLE = 0x938097252667b9eFAc600c8Dd1826F54eAE96881;
    address constant RISK_FEED = 0xD91E56a9999974A1319150Cd6FA00bC87CC2d91D;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
    address eoa = makeAddr("wallet");
    bool on;

    function setUp() public {
        on = vm.envOr("FORK", uint256(0)) == 1;
        if (!on) return;
        vm.createSelectFork("robinhood");
    }

    function test_walletReadsARowForFree() public {
        if (!on) return;
        vm.startPrank(eoa, eoa);
        (uint8 v, uint64 verdictAt, uint64 writtenAt) = IHarmonicOracle(ORACLE).verdictOf(NVDA);
        vm.stopPrank();
        assertLe(v, uint8(IHarmonicOracle.Verdict.Open), "verdict in range");
        assertGt(writtenAt, 0, "row written");
        assertLe(block.timestamp - writtenAt, 2 days, "row written in the last two days (free heartbeat is daily)");
        assertLe(verdictAt, writtenAt + 1, "verdict not after the write");
        emit log_named_uint("NVDA verdict (0 unknown .. 3 held .. 5 open)", v);
        emit log_named_uint("NVDA row age, seconds", block.timestamp - writtenAt);
        vm.prank(eoa, eoa);
        bool open = IHarmonicOracle(ORACLE).isOpenWithin(AAPL, 1 days);
        vm.prank(eoa, eoa);
        (uint8 va,,) = IHarmonicOracle(ORACLE).verdictOf(AAPL);
        assertEq(open, va == uint8(IHarmonicOracle.Verdict.Open), "isOpenWithin agrees with the verdict");
    }

    function test_unpaidContractGetsUnreadableNotAnAnswer() public {
        if (!on) return;
        ForkGatedDesk desk = new ForkGatedDesk(ORACLE);
        assertFalse(IHarmonicOracle(ORACLE).canRead(address(desk)), "a fresh contract is not a paid reader");
        (HarmonicHaltGate.GateVerdict g,,) = desk.check(NVDA);
        assertEq(uint8(g), uint8(HarmonicHaltGate.GateVerdict.Unreadable));
        (bool paid, uint64 until) = desk.gateSubscribed();
        assertFalse(paid);
        assertEq(until, 0);
    }

    function test_riskFeedInterfaceAnswers() public {
        if (!on) return;
        vm.prank(eoa, eoa);
        (uint8 session, uint40 endsAt) = IHarmonicRiskFeedView(RISK_FEED).sessionNow();
        emit log_named_uint("risk feed session (3 = weekend)", session);
        emit log_named_uint("session ends at", endsAt);
        assertLe(session, 10);
    }
}

interface IHarmonicRiskFeedView {
    function sessionNow() external view returns (uint8 session, uint40 endsAt);
}
