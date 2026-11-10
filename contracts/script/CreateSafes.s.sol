// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, VmSafe, console2} from "forge-std/Script.sol";

/// @notice Creates the three role Safes (admin, guardian, ops) on chains where Safe v1.4.1 is deployed at its
/// canonical addresses (Robinhood Chain 4663 included). Owners = SAFE_OWNERS (comma separated).
/// Admin and ops need ADMIN_THRESHOLD (default 2) signatures; the guardian needs GUARDIAN_THRESHOLD (default 1)
/// so a pause can happen fast (the guardian can only pause/disable, never move funds).
/// Writes deployments/safes-<chainId>.json (or .dry-run.json when simulating).
interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

interface ISafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
    function getThreshold() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
}

contract CreateSafes is Script {
    address internal constant SAFE_L2_141 = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762; // v1.4.1
    address internal constant FACTORY_141 = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67; // v1.4.1
    address internal constant FALLBACK_141 = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99; // CompatibilityFallbackHandler
    // Chains that only carry Safe v1.3.0 at its canonical addresses (Elysium 99901, docs/ELYSIUM.md) set
    // SAFE_SINGLETON / SAFE_FACTORY / SAFE_FALLBACK in env; `setup` has the same signature in both versions.
    address internal SAFE_L2 = vm.envOr("SAFE_SINGLETON", SAFE_L2_141);
    address internal FACTORY = vm.envOr("SAFE_FACTORY", FACTORY_141);
    address internal FALLBACK = vm.envOr("SAFE_FALLBACK", FALLBACK_141);

    function run() external {
        require(SAFE_L2.code.length > 0 && FACTORY.code.length > 0, "Safe singleton/factory not deployed on this chain");
        address[] memory owners = vm.envAddress("SAFE_OWNERS", ",");
        require(owners.length > 0, "SAFE_OWNERS is empty");
        uint256 adminThreshold = vm.envOr("ADMIN_THRESHOLD", uint256(2));
        uint256 guardianThreshold = vm.envOr("GUARDIAN_THRESHOLD", uint256(1));
        require(adminThreshold > 0 && adminThreshold <= owners.length, "bad ADMIN_THRESHOLD");
        require(guardianThreshold > 0 && guardianThreshold <= owners.length, "bad GUARDIAN_THRESHOLD");
        // A different salt per role and per run, so re-running never collides with an earlier Safe.
        uint256 base = uint256(keccak256(abi.encode("kyte-safes", block.timestamp, msg.sender)));

        vm.startBroadcast();
        address admin = _create(owners, adminThreshold, base + 1);
        address guardian = _create(owners, guardianThreshold, base + 2);
        address ops = _create(owners, adminThreshold, base + 3);
        vm.stopBroadcast();

        require(ISafe(admin).getThreshold() == adminThreshold, "admin Safe setup failed");
        require(ISafe(guardian).getThreshold() == guardianThreshold, "guardian Safe setup failed");
        console2.log("ADMIN_SAFE", admin);
        console2.log("GUARDIAN", guardian);
        console2.log("OPS_SAFE", ops);

        bool dry = !vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.isContext(VmSafe.ForgeContext.ScriptResume);
        string memory k = "safes";
        vm.serializeAddress(k, "admin", admin);
        vm.serializeAddress(k, "guardian", guardian);
        string memory json = vm.serializeAddress(k, "ops", ops);
        string memory path =
            string.concat("deployments/safes-", vm.toString(block.chainid), dry ? ".dry-run.json" : ".json");
        // Never overwrite an existing record (a fork of mainnet reports the same chain id): write beside it.
        if (!dry && vm.exists(path)) {
            path = string.concat(
                "deployments/safes-", vm.toString(block.chainid), "-", vm.toString(block.timestamp), ".json"
            );
        }
        vm.writeJson(json, path);
        console2.log("written to", path);
    }

    function _create(address[] memory owners, uint256 threshold, uint256 salt) internal returns (address) {
        bytes memory init = abi.encodeCall(
            ISafe.setup, (owners, threshold, address(0), "", FALLBACK, address(0), 0, payable(address(0)))
        );
        return ISafeProxyFactory(FACTORY).createProxyWithNonce(SAFE_L2, init, salt);
    }
}
