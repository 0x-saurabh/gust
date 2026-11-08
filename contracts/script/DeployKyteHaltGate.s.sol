// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {KyteHaltGate} from "../src/KyteHaltGate.sol";

/// @notice Deploys KyteHaltGate on Robinhood Chain against Harmonic Agent's session oracle.
/// env: ORACLE (default the live HarmonicOracle), MAX_AGE seconds (default 1 day: the oracle rewrites a free row
///      once a day; a paid seat's tokens are rewritten hourly, so 1 day is the widest an unsubscribed row stays Open).
contract DeployKyteHaltGate is Script {
    function run() external returns (KyteHaltGate gate) {
        address oracle = vm.envOr("ORACLE", address(0x938097252667b9eFAc600c8Dd1826F54eAE96881));
        uint64 maxAge = uint64(vm.envOr("MAX_AGE", uint256(1 days)));
        vm.startBroadcast();
        gate = new KyteHaltGate(oracle, maxAge);
        vm.stopBroadcast();
        console2.log("KyteHaltGate", address(gate));
    }
}
