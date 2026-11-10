// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "./lib/Errors.sol";
import {Governed} from "./lib/Governed.sol";
import {IRewardSink} from "./interfaces/IRewardSink.sol";

/// @title RewardSink
/// @notice A holding vault for FeeVault shares on chains where $KYTE is not deployed yet (docs/ELYSIUM.md).
/// FeeVault needs a `stakingPool` that implements `notifyReward` and a `buybackBurner`; on such a chain both point
/// here. The quote token (WHYPE on Elysium) accumulates and the timelock moves it out: to the Robinhood Chain
/// StakingPool and BuybackBurner once bridged, or to a local StakingPool when $KYTE arrives. Nothing else can move it.
contract RewardSink is Governed, IRewardSink {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    /// @notice Total ever notified by the FeeVault (the stakers' share), for the proof page.
    uint256 public totalNotified;

    event RewardNotified(uint256 amount, uint256 totalNotified);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(IERC20 token_, address timelock_, address guardian_) Governed(timelock_, guardian_) {
        if (address(token_) == address(0)) revert Errors.ZeroAddress();
        token = token_;
    }

    /// @inheritdoc IRewardSink
    /// @dev FeeVault transfers first, then calls this. Anyone may call; it only counts.
    function notifyReward(uint256 amount) external {
        totalNotified += amount;
        emit RewardNotified(amount, totalNotified);
    }

    /// @notice Timelock only. Moves accumulated fees out (bridge to the Robinhood Chain pool, or a local pool later).
    function withdraw(address to, uint256 amount) external onlyTimelock {
        if (to == address(0)) revert Errors.ZeroAddress();
        token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }
}
