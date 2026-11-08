// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IHarmonicOracle
/// @notice Harmonic Agent's session oracle on Robinhood Chain (`0x938097252667b9efac600c8dd1826f54eae96881`): per
///         Robinhood stock token, whether the stock behind it is trading. Rows are written on every verdict change
///         and once a day. A wallet or a script reads free; a contract reading inside its own transaction must be a
///         paid reader (`subscribe(reader, months)`, 100 USDG a month at launch, paid to Harmonic's operations wallet).
///         Kyte reads this off chain in the indexer today (docs/HARMONIC.md); this interface is for the Autopilot
///         vault or any Kyte contract that one day needs the verdict on chain.
interface IHarmonicOracle {
    /// Verdict enum as the oracle defines it.
    enum Verdict {
        Unknown, // 0: no halt flag or no quote time read
        Halted, // 1: the issuer halted the stock
        Paused, // 2: the token is paused for a corporate action
        Held, // 3: the 24/5 session is in its weekend hold; the print stands still
        Stale, // 4: the issuer has not printed inside the freshness window
        Open // 5: trading, on a fresh row
    }

    /// @return verdict one of {Verdict}; verdictAt when the verdict was reached; writtenAt when the row was last written.
    function verdictOf(address token) external view returns (uint8 verdict, uint64 verdictAt, uint64 writtenAt);
    /// @notice True only when the row reads Open and was written no more than `maxAge` seconds ago.
    function isOpenWithin(address token, uint64 maxAge) external view returns (bool);
    /// @notice Whether `reader` (a contract) may read rows inside a transaction right now.
    function canRead(address reader) external view returns (bool);
    /// @notice Unix time until which `reader` is paid, 0 when it never was.
    function paidUntil(address reader) external view returns (uint64);
}

/// @title IHarmonicRiskFeed
/// @notice Harmonic's risk feed (`0xd91e56a9999974a1319150cd6fa00bc87cc2d91d`): per stock token a priceability status
///         (0 unknown to 10 live) and a USD mark with 8 decimals (the share price times the dividend multiplier, the
///         unit the token's Chainlink feeds use). Not live-priced as of 8 Nov 2026: writes are paid and nobody pays.
///         A contract read needs the same paid seat as the oracle. The candidate on-chain price source for Autopilot
///         vault rules on stock tokens, which have no Kyte pool and so no TWAP (AUTOPILOT_SPEC.md, open decision 2).
interface IHarmonicRiskFeed {
    function statusOf(address token)
        external
        view
        returns (uint8 status, uint128 mark, uint40 markAt, uint40 checkedAt, uint32 round);
    /// @dev Reverts `NotPriceable(token, status)` when the status is below `minStatus` (9 extended hours, 10 live).
    function markOf(address token, uint8 minStatus) external view returns (uint128 mark, uint8 status, uint40 checkedAt);
    function sessionNow() external view returns (uint8 session, uint40 endsAt);
    function canRead(address reader) external view returns (bool);
}
