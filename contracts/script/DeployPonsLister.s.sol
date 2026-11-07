// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {PonsLister} from "../src/PonsLister.sol";

/// @notice Deploys PonsLister for mainnet (chain 4663). After this, ONE timelock operation (Safe) grants the lister
/// PROPOSER_ROLE and EXECUTOR_ROLE on the TimelockController; from then on listings need no signatures.
///
/// env: TIMELOCK, GUARDIAN, REGISTRY (the live markets' registry, v3), WETH, PONS_FACTORY, PONS_LEGACY_FACTORY,
///      PONS_LOCKER, PONS_LEGACY_LOCKER, CAP_BPS (default 200), MIN_STRIKE (default 1e12)
contract DeployPonsLister is Script {
    function run() external returns (PonsLister lister) {
        address[] memory factories = new address[](2);
        factories[0] = vm.envAddress("PONS_FACTORY");
        factories[1] = vm.envAddress("PONS_LEGACY_FACTORY");
        address[] memory lockers = new address[](2);
        lockers[0] = vm.envAddress("PONS_LOCKER");
        lockers[1] = vm.envAddress("PONS_LEGACY_LOCKER");
        uint256 capBps = vm.envOr("CAP_BPS", uint256(200));
        uint256 minStrike = vm.envOr("MIN_STRIKE", uint256(1e12));
        vm.startBroadcast();
        lister = new PonsLister(
            vm.envAddress("TIMELOCK"),
            vm.envAddress("GUARDIAN"),
            vm.envAddress("REGISTRY"),
            vm.envAddress("WETH"),
            factories,
            lockers,
            capBps,
            minStrike
        );
        vm.stopBroadcast();
        console2.log("PonsLister", address(lister));
    }
}
