// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {HarmonicHaltGate} from "./lib/harmonic/HarmonicHaltGate.sol";

/// @title KyteHaltGate
/// @notice Kyte's one on-chain reader of Harmonic Agent's session oracle (docs/HARMONIC.md, phase 3). Any Kyte contract
///         (an Autopilot vault, a stock-token pool hook) and any script asks this contract, not the oracle, whether the
///         stock behind a Robinhood stock token is trading right now. One paid seat on the oracle, bought for this
///         address with `subscribe(address(this), months)`, then serves every caller. Until the seat is paid the gate
///         answers `Unreadable`, never a made-up `Open`.
///
///         Immutable: no owner, no pause, nothing to upgrade, holds no funds. The oracle address and the row age it
///         accepts are fixed at deployment; a different setting is a new deployment.
contract KyteHaltGate is HarmonicHaltGate {
    constructor(address oracle, uint64 maxAge) HarmonicHaltGate(oracle, maxAge) {}

    /// @notice True only when the oracle row for `token` reads Open and is fresh. False for every other case,
    ///         including an unpaid seat, so a caller that wants the reason uses {gateVerdict} or {requireOpen}.
    function isOpen(address token) external view returns (bool) {
        (GateVerdict g,,) = gateVerdict(token);
        return g == GateVerdict.Open;
    }

    /// @notice Reverts with the gate's own reason (NotOpen, OracleQuiet, OracleUnreadable) unless `token` is open.
    ///         For a contract that wants the revert to bubble up through its own call, and for `eth_call` from a UI.
    function requireOpen(address token) external view {
        _requireOpen(token);
    }

    /// @notice One read for many tokens: the gate verdict, the oracle verdict and the row age per token.
    function gateVerdicts(address[] calldata tokens)
        external
        view
        returns (GateVerdict[] memory gates, uint8[] memory verdicts, uint64[] memory ages)
    {
        gates = new GateVerdict[](tokens.length);
        verdicts = new uint8[](tokens.length);
        ages = new uint64[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            (gates[i], verdicts[i], ages[i]) = gateVerdict(tokens[i]);
        }
    }
}
