// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {UsdgRewards} from "../src/UsdgRewards.sol";

/// @notice Deploys UsdgRewards for mainnet (chain 4663). No Safe step: the publisher is set in the constructor and the
/// ops Safe simply transfers USDG to the contract to fund epochs.
///
/// env: TIMELOCK, GUARDIAN, USDG (0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168), PUBLISHER (the keeper wallet),
///      CLAIM_WINDOW (default 90 days, seconds)
contract DeployUsdgRewards is Script {
    function run() external returns (UsdgRewards rewards) {
        vm.startBroadcast();
        rewards = new UsdgRewards(
            vm.envAddress("TIMELOCK"),
            vm.envAddress("GUARDIAN"),
            vm.envAddress("USDG"),
            vm.envAddress("PUBLISHER"),
            uint64(vm.envOr("CLAIM_WINDOW", uint256(90 days)))
        );
        vm.stopBroadcast();
        console2.log("UsdgRewards", address(rewards));
    }
}
