// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, VmSafe, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {CallMarket} from "../src/CallMarket.sol";
import {OptionNFT} from "../src/OptionNFT.sol";
import {PutMarket} from "../src/PutMarket.sol";
import {Router} from "../src/Router.sol";
import {IAssetRegistry} from "../src/interfaces/IAssetRegistry.sol";
import {IOptionNFT} from "../src/interfaces/IOptionNFT.sol";
import {IWETH} from "../src/interfaces/IWETH.sol";

/// @notice Markets v2: a new AssetRegistry (300 assets instead of 25, for the Robinhood Stock Tokens), OptionNFT,
/// CallMarket, PutMarket and Router, wired to the protocol that is already live: same timelock, guardian,
/// FeeVault (so fees keep flowing to stakers, buyback and ops), WETH. v1 markets stay as they are, so every open
/// v1 position can still be bought, exercised, expired or cancelled.
///
/// Reads the live addresses from deployments/<chainId>.json and writes the new ones back into it under `v2`
/// (a dry run writes deployments/<chainId>.v2.dry-run.json instead). `v2.fromBlock` (the L2 block, which
/// `block.number` is not on an Arbitrum chain) is added afterwards from the broadcast receipts by v2-plan.mjs.
///
///   forge script script/DeployMarketsV2.s.sol --rpc-url <rpc> --account deployer --broadcast --slow
///
/// Then, through the timelock (scripts/mainnet/v2-plan.mjs builds the Safe batches):
/// callMarket.setRouter(router), putMarket.setRouter(router), registry.addAssets(...) in batches.
/// scripts/mainnet/markets-v2.sh runs all of it.
contract DeployMarketsV2 is Script {
    uint256 internal constant MAINNET = 4663;

    struct V2 {
        AssetRegistry registry;
        OptionNFT nft;
        CallMarket calls;
        PutMarket puts;
        Router router;
    }

    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory dep = vm.readFile(path);
        require(!vm.keyExistsJson(dep, ".v2"), "v2 already deployed (remove `v2` from the deployment file to redeploy)");
        address timelock = vm.parseJsonAddress(dep, ".timelock");
        address guardian = vm.parseJsonAddress(dep, ".guardian");
        address weth = vm.parseJsonAddress(dep, ".weth");
        address vault = vm.parseJsonAddress(dep, ".feeVault");
        uint32 feePremium = uint32(vm.envOr("FEE_BPS_PREMIUM", uint256(300)));
        uint16 feeExercise = uint16(vm.envOr("FEE_BPS_EXERCISE", uint256(10)));
        require(timelock.code.length > 0 && guardian.code.length > 0, "timelock/guardian must be contracts");
        require(weth.code.length > 0 && vault.code.length > 0, "WETH/FeeVault have no code on this chain");
        if (block.chainid == MAINNET) require(TimelockController(payable(timelock)).getMinDelay() >= 10 minutes, "timelock delay");

        V2 memory o;
        vm.startBroadcast();
        o.registry = new AssetRegistry(timelock, guardian);
        o.nft = new OptionNFT();
        o.calls = new CallMarket(
            IAssetRegistry(address(o.registry)), IOptionNFT(address(o.nft)), IERC20(weth), vault, timelock, guardian, feePremium, feeExercise
        );
        o.puts = new PutMarket(
            IAssetRegistry(address(o.registry)), IOptionNFT(address(o.nft)), IERC20(weth), vault, timelock, guardian, feePremium, feeExercise
        );
        o.nft.setMarkets(address(o.calls), address(o.puts)); // locked from here on
        o.router = new Router(IWETH(weth), o.calls, o.puts);
        vm.stopBroadcast();

        string memory k = "v2";
        vm.serializeAddress(k, "assetRegistry", address(o.registry));
        vm.serializeAddress(k, "optionNft", address(o.nft));
        vm.serializeAddress(k, "callMarket", address(o.calls));
        vm.serializeAddress(k, "putMarket", address(o.puts));
        string memory v2 = vm.serializeAddress(k, "router", address(o.router));
        bool dry = !vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.isContext(VmSafe.ForgeContext.ScriptResume);
        if (dry) {
            string memory out = string.concat("deployments/", vm.toString(block.chainid), ".v2.dry-run.json");
            vm.writeJson(v2, out);
            console2.log("dry run written to", out);
        } else {
            vm.writeJson(v2, path, ".v2");
            console2.log("v2 written into", path);
        }
    }
}
