// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {FoboLister} from "../src/FoboLister.sol";

/// @notice Deploys FoboLister for mainnet (chain 4663). After this, ONE timelock operation (Safe) grants the lister
/// PROPOSER_ROLE and EXECUTOR_ROLE on the TimelockController; from then on listings need no signatures.
///
/// env: TIMELOCK, GUARDIAN, REGISTRY (the live markets' registry, v3), FOBO_HOOK, CAP_BPS (default 200),
///      MIN_STRIKE (default 1e12), MIN_AGE (default 86400 s), MIN_FLOOR_ETH_WEI (default 4.2e18), PUTS_ON (default true)
contract DeployFoboLister is Script {
    function run() external returns (FoboLister lister) {
        vm.startBroadcast();
        lister = new FoboLister(
            vm.envAddress("TIMELOCK"),
            vm.envAddress("GUARDIAN"),
            vm.envAddress("REGISTRY"),
            vm.envAddress("FOBO_HOOK"),
            vm.envOr("CAP_BPS", uint256(200)),
            vm.envOr("MIN_STRIKE", uint256(1e12)),
            vm.envOr("MIN_AGE", uint256(1 days)),
            vm.envOr("MIN_FLOOR_ETH_WEI", uint256(4.2 ether)),
            vm.envOr("PUTS_ON", true)
        );
        vm.stopBroadcast();
        console2.log("FoboLister", address(lister));
    }
}
