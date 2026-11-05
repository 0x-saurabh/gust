// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, VmSafe, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {BuybackBurner} from "../src/BuybackBurner.sol";
import {StakingPool} from "../src/StakingPool.sol";

/// @notice $KYTE launch: the protocol token moves from the test token to the live one. StakingPool and
/// BuybackBurner hold their token as `immutable`, so both are deployed again for the new token; everything else
/// (FeeVault, markets, registry, timelock, guardian, keeper) stays. The old pool keeps the test stake and stays
/// claimable; nothing is migrated.
///
/// Reads deployments/<chainId>.json and writes the new addresses under `launch` (a dry run writes
/// deployments/<chainId>.launch.dry-run.json instead). kyte-launch-plan.mjs then promotes them to the top level
/// and builds the timelock operations (FeeVault.setDestinations, BuybackBurner.setAdapter, registry.addAsset).
///
///   KYTE_TOKEN=0x... forge script script/DeployKyteLaunch.s.sol --rpc-url <rpc> --account deployer --broadcast --slow
///
/// scripts/mainnet/kyte-launch.sh runs all of it.
contract DeployKyteLaunch is Script {
    uint256 internal constant MAINNET = 4663;

    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory dep = vm.readFile(path);
        address kyte = vm.envAddress("KYTE_TOKEN");
        address oldKyte = vm.parseJsonAddress(dep, ".kyteToken");
        address timelock = vm.parseJsonAddress(dep, ".timelock");
        address guardian = vm.parseJsonAddress(dep, ".guardian");
        address keeper = vm.parseJsonAddress(dep, ".keeper");
        address weth = vm.parseJsonAddress(dep, ".weth");
        address vault = vm.parseJsonAddress(dep, ".feeVault");

        require(kyte != address(0) && kyte.code.length > 0, "KYTE_TOKEN has no code");
        require(kyte != oldKyte, "KYTE_TOKEN is already the protocol token");
        require(IERC20Metadata(kyte).decimals() == 18, "KYTE_TOKEN must have 18 decimals");
        require(IERC20(kyte).totalSupply() > 0, "KYTE_TOKEN has no supply");
        if (vm.keyExistsJson(dep, ".launch")) {
            require(
                vm.parseJsonAddress(dep, ".launch.kyteToken") != kyte,
                "launch already deployed for this token (remove `launch` to redeploy)"
            );
        }
        require(timelock.code.length > 0 && guardian.code.length > 0, "timelock/guardian must be contracts");
        require(weth.code.length > 0 && vault.code.length > 0, "missing code");
        require(keeper != address(0), "keeper is zero");
        if (block.chainid == MAINNET) {
            require(TimelockController(payable(timelock)).getMinDelay() >= 10 minutes, "timelock delay");
        }
        console2.log("token", kyte, IERC20Metadata(kyte).symbol());

        vm.startBroadcast();
        StakingPool pool = new StakingPool(IERC20(kyte), IERC20(weth), vault, timelock, guardian);
        BuybackBurner burner = new BuybackBurner(IERC20(weth), IERC20(kyte), keeper, timelock, guardian);
        vm.stopBroadcast();

        string memory k = "launch";
        vm.serializeAddress(k, "kyteToken", kyte);
        vm.serializeAddress(k, "stakingPool", address(pool));
        string memory launch = vm.serializeAddress(k, "buybackBurner", address(burner));
        bool dry = !vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.isContext(VmSafe.ForgeContext.ScriptResume);
        if (dry) {
            string memory out = string.concat("deployments/", vm.toString(block.chainid), ".launch.dry-run.json");
            vm.writeJson(launch, out);
            console2.log("dry run written to", out);
        } else {
            vm.writeJson(launch, path, ".launch");
            console2.log("launch written into", path);
        }
    }
}
