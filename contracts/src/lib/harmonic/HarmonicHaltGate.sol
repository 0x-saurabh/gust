// SPDX-License-Identifier: MIT
// Vendored from https://harmonicagent.solutions/oracle/halt-gate/HarmonicHaltGate.sol on 2026-11-08 (MIT, Harmonic).
// One change: the pragma was widened from `0.8.24` to `^0.8.24` so it compiles beside Kyte's 0.8.28 contracts.
// Not deployed by Kyte yet: a Kyte pool, lender or vault that trades stock tokens inherits it and calls
// _requireOpen(token) before a fill. Reading the oracle from a contract is a paid seat (docs/HARMONIC.md, phase 3).
pragma solidity ^0.8.24;

/**
 * HARMONIC HALT GATE. Inherit it in your own Uniswap v4 hook, lender or vault
 * and call _requireOpen(token) before a fill. The gate asks HarmonicOracle on
 * Robinhood Chain two things about the stock behind a token: does its row
 * read open, and was that row written recently enough to trust. Anything
 * else reverts, with a reason a frontend can show.
 *
 * WHAT THE ORACLE'S ROW CAN SAY, and what the gate does with it:
 *
 *   open, written inside maxAge     fill
 *   open, written longer ago        OracleQuiet: the row has gone quiet, and
 *                                   a quiet row is not open whatever it last said
 *   halted, paused, held, stale,
 *   unknown, or never written       NotOpen, with the verdict the row reads
 *   the oracle refuses the read     OracleUnreadable: this contract is not a
 *                                   paid reader right now, or the oracle
 *                                   address is wrong
 *
 * A READ FROM INSIDE A CONTRACT IS A PAID READ. Reading a row from a wallet or
 * a script is free; a contract reading a row inside its own transaction pays
 * the oracle's monthly fee, 100 USDG a month at launch, paid from any wallet
 * to the operations wallet in one step with subscribe(address(this), months).
 * The oracle holds nothing. gateSubscribed() says whether this contract is
 * paid right now and until when, and is free to read.
 *
 * THE DECISION IS THE ORACLE'S OWN. gateVerdict() reaches the same answer as
 * the oracle's isOpenWithin(token, maxAge), and the test suite holds the two
 * equal on every verdict at every age; this contract only adds the reason.
 *
 * NO DEPENDENCIES. Nothing here imports a pool manager or a hook library, so
 * it drops into any contract: a v4 hook's beforeSwap, a lender's borrow, a
 * vault's deposit. It holds no money, has no owner, and nothing in it writes.
 */
interface IHarmonicOracleGate {
    function verdictOf(address token) external view returns (uint8 verdict, uint64 verdictAt, uint64 writtenAt);
    function canRead(address reader) external view returns (bool);
    function paidUntil(address reader) external view returns (uint64);
}

abstract contract HarmonicHaltGate {
    /// The oracle's own Verdict enum: Unknown 0, Halted 1, Paused 2, Held 3, Stale 4, Open 5.
    uint8 public constant ORACLE_OPEN = 5;

    IHarmonicOracleGate public immutable haltOracle;
    /// Seconds a row may be old and still count as open. The oracle rewrites a
    /// free row once a day and a live token's row once an hour, so 1 hours
    /// suits a token somebody keeps live and 1 days suits one nobody does.
    uint64 public immutable haltMaxAge;

    enum GateVerdict {
        Open,
        NotOpen,
        Quiet,
        Unreadable
    }

    error NotOpen(address token, uint8 verdict);
    error OracleQuiet(address token, uint64 age);
    error OracleUnreadable(address token);
    error GateNeedsOracle();
    error GateNeedsMaxAge();

    constructor(address oracle_, uint64 maxAge_) {
        if (oracle_ == address(0)) revert GateNeedsOracle();
        if (maxAge_ == 0) revert GateNeedsMaxAge();
        haltOracle = IHarmonicOracleGate(oracle_);
        haltMaxAge = maxAge_;
    }

    /// The decision without the revert, so a frontend or a test can read it.
    function gateVerdict(address token) public view returns (GateVerdict verdict, uint8 oracleVerdict, uint64 age) {
        try haltOracle.verdictOf(token) returns (uint8 v, uint64, uint64 writtenAt) {
            if (writtenAt == 0 || v != ORACLE_OPEN) return (GateVerdict.NotOpen, v, 0);
            uint64 a = uint64(block.timestamp) - writtenAt;
            if (a > haltMaxAge) return (GateVerdict.Quiet, v, a);
            return (GateVerdict.Open, v, a);
        } catch {
            return (GateVerdict.Unreadable, 0, 0);
        }
    }

    /// Call this before a fill. Returns quietly when the stock is open on a fresh row; reverts otherwise.
    function _requireOpen(address token) internal view {
        (GateVerdict g, uint8 v, uint64 age) = gateVerdict(token);
        if (g == GateVerdict.Open) return;
        if (g == GateVerdict.NotOpen) revert NotOpen(token, v);
        if (g == GateVerdict.Quiet) revert OracleQuiet(token, age);
        revert OracleUnreadable(token);
    }

    /// Whether the oracle serves this contract right now, and until when. Free to read.
    function gateSubscribed() external view returns (bool paid, uint64 until) {
        return (haltOracle.canRead(address(this)), haltOracle.paidUntil(address(this)));
    }
}
