// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {HarmonicHaltGate} from "../src/lib/harmonic/HarmonicHaltGate.sol";
import {IHarmonicOracle} from "../src/interfaces/IHarmonicOracle.sol";

/// A stand-in for HarmonicOracle: rows per token, and a paid-reader allowlist. An unpaid contract read reverts, as
/// the real oracle refuses it.
contract MockHarmonicOracle {
    struct Row {
        uint8 verdict;
        uint64 verdictAt;
        uint64 writtenAt;
    }

    mapping(address => Row) public rows;
    mapping(address => uint64) public paidUntil;

    function set(address token, uint8 verdict, uint64 writtenAt) external {
        rows[token] = Row(verdict, writtenAt, writtenAt);
    }

    function pay(address reader, uint64 until) external {
        paidUntil[reader] = until;
    }

    function canRead(address reader) public view returns (bool) {
        return paidUntil[reader] >= block.timestamp;
    }

    function verdictOf(address token) external view returns (uint8, uint64, uint64) {
        require(canRead(msg.sender), "oracle: not a paid reader");
        Row memory r = rows[token];
        return (r.verdict, r.verdictAt, r.writtenAt);
    }
}

/// The smallest Kyte-shaped consumer: a fill that must pass the gate.
contract GatedDesk is HarmonicHaltGate {
    uint256 public fills;

    constructor(address oracle, uint64 maxAge) HarmonicHaltGate(oracle, maxAge) {}

    function fill(address token) external {
        _requireOpen(token);
        fills += 1;
    }
}

/// @notice Unit tests for the vendored halt gate against a mock oracle: every verdict, the age rule, and the paid seat.
contract HarmonicHaltGateTest is Test {
    MockHarmonicOracle oracle;
    GatedDesk desk;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    uint64 constant MAX_AGE = 1 hours;

    function setUp() public {
        vm.warp(1_794_000_000);
        oracle = new MockHarmonicOracle();
        desk = new GatedDesk(address(oracle), MAX_AGE);
        oracle.pay(address(desk), uint64(block.timestamp + 30 days));
    }

    function test_openFreshRowFills() public {
        oracle.set(NVDA, uint8(IHarmonicOracle.Verdict.Open), uint64(block.timestamp - 10 minutes));
        desk.fill(NVDA);
        assertEq(desk.fills(), 1);
        (HarmonicHaltGate.GateVerdict g, uint8 v, uint64 age) = desk.gateVerdict(NVDA);
        assertEq(uint8(g), uint8(HarmonicHaltGate.GateVerdict.Open));
        assertEq(v, 5);
        assertEq(age, 10 minutes);
    }

    function test_everyNonOpenVerdictReverts() public {
        for (uint8 v = 0; v < 5; v++) {
            oracle.set(NVDA, v, uint64(block.timestamp));
            vm.expectRevert(abi.encodeWithSelector(HarmonicHaltGate.NotOpen.selector, NVDA, v));
            desk.fill(NVDA);
        }
    }

    function test_heldOverTheWeekendIsNotOpen() public {
        oracle.set(NVDA, uint8(IHarmonicOracle.Verdict.Held), uint64(block.timestamp));
        (HarmonicHaltGate.GateVerdict g, uint8 v,) = desk.gateVerdict(NVDA);
        assertEq(uint8(g), uint8(HarmonicHaltGate.GateVerdict.NotOpen));
        assertEq(v, uint8(IHarmonicOracle.Verdict.Held));
    }

    function test_neverWrittenIsNotOpen() public {
        vm.expectRevert(abi.encodeWithSelector(HarmonicHaltGate.NotOpen.selector, NVDA, 0));
        desk.fill(NVDA);
    }

    function test_quietRowReverts() public {
        oracle.set(NVDA, uint8(IHarmonicOracle.Verdict.Open), uint64(block.timestamp - MAX_AGE - 1));
        vm.expectRevert(abi.encodeWithSelector(HarmonicHaltGate.OracleQuiet.selector, NVDA, uint64(MAX_AGE + 1)));
        desk.fill(NVDA);
    }

    function test_rowExactlyAtMaxAgeStillOpen() public {
        oracle.set(NVDA, uint8(IHarmonicOracle.Verdict.Open), uint64(block.timestamp - MAX_AGE));
        desk.fill(NVDA);
    }

    function test_unpaidReaderIsUnreadable() public {
        oracle.set(NVDA, uint8(IHarmonicOracle.Verdict.Open), uint64(block.timestamp));
        GatedDesk unpaid = new GatedDesk(address(oracle), MAX_AGE);
        (HarmonicHaltGate.GateVerdict g,,) = unpaid.gateVerdict(NVDA);
        assertEq(uint8(g), uint8(HarmonicHaltGate.GateVerdict.Unreadable));
        vm.expectRevert(abi.encodeWithSelector(HarmonicHaltGate.OracleUnreadable.selector, NVDA));
        unpaid.fill(NVDA);
        (bool paid,) = unpaid.gateSubscribed();
        assertFalse(paid);
        (paid,) = desk.gateSubscribed();
        assertTrue(paid);
    }

    function test_seatExpiryClosesTheGate() public {
        oracle.set(NVDA, uint8(IHarmonicOracle.Verdict.Open), uint64(block.timestamp));
        vm.warp(block.timestamp + 31 days);
        oracle.set(NVDA, uint8(IHarmonicOracle.Verdict.Open), uint64(block.timestamp));
        vm.expectRevert(abi.encodeWithSelector(HarmonicHaltGate.OracleUnreadable.selector, NVDA));
        desk.fill(NVDA);
    }

    function test_constructorGuards() public {
        vm.expectRevert(HarmonicHaltGate.GateNeedsOracle.selector);
        new GatedDesk(address(0), MAX_AGE);
        vm.expectRevert(HarmonicHaltGate.GateNeedsMaxAge.selector);
        new GatedDesk(address(oracle), 0);
    }
}

import {KyteHaltGate} from "../src/KyteHaltGate.sol";

/// @notice KyteHaltGate on the same mock oracle: isOpen, requireOpen and the batch read.
contract KyteHaltGateTest is Test {
    MockHarmonicOracle oracle;
    KyteHaltGate gate;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;

    function setUp() public {
        vm.warp(1_794_000_000);
        oracle = new MockHarmonicOracle();
        gate = new KyteHaltGate(address(oracle), 1 days);
    }

    function test_unpaidIsNotOpenAndSaysWhy() public {
        oracle.set(NVDA, uint8(IHarmonicOracle.Verdict.Open), uint64(block.timestamp));
        assertFalse(gate.isOpen(NVDA));
        vm.expectRevert(abi.encodeWithSelector(HarmonicHaltGate.OracleUnreadable.selector, NVDA));
        gate.requireOpen(NVDA);
    }

    function test_paidSeatAnswers() public {
        oracle.pay(address(gate), uint64(block.timestamp + 30 days));
        oracle.set(NVDA, uint8(IHarmonicOracle.Verdict.Open), uint64(block.timestamp - 2 hours));
        oracle.set(AAPL, uint8(IHarmonicOracle.Verdict.Held), uint64(block.timestamp));
        assertTrue(gate.isOpen(NVDA));
        assertFalse(gate.isOpen(AAPL));
        gate.requireOpen(NVDA);
        vm.expectRevert(abi.encodeWithSelector(HarmonicHaltGate.NotOpen.selector, AAPL, 3));
        gate.requireOpen(AAPL);
        address[] memory t = new address[](2);
        t[0] = NVDA;
        t[1] = AAPL;
        (HarmonicHaltGate.GateVerdict[] memory g, uint8[] memory v, uint64[] memory a) = gate.gateVerdicts(t);
        assertEq(uint8(g[0]), uint8(HarmonicHaltGate.GateVerdict.Open));
        assertEq(uint8(g[1]), uint8(HarmonicHaltGate.GateVerdict.NotOpen));
        assertEq(v[0], 5);
        assertEq(v[1], 3);
        assertEq(a[0], 2 hours);
        assertEq(a[1], 0);
    }
}
