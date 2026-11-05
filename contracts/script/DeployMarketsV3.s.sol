// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, VmSafe, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CallMarket} from "../src/CallMarket.sol";
import {OptionNFT} from "../src/OptionNFT.sol";
import {PutMarket} from "../src/PutMarket.sol";
import {Router} from "../src/Router.sol";
import {IAssetRegistry} from "../src/interfaces/IAssetRegistry.sol";
import {IOptionNFT} from "../src/interfaces/IOptionNFT.sol";
import {IWETH} from "../src/interfaces/IWETH.sol";
import {Constants} from "../src/lib/Constants.sol";

/// @notice Markets v3: a new OptionNFT (readable on-chain art: token amounts, ETH prices, UTC expiry), CallMarket,
/// PutMarket and Router. The v2 AssetRegistry is reused, so every token listed there (every Robinhood Stock Token
/// and the crypto tokens) is tradeable in v3 with no new listings. Same timelock, guardian, FeeVault, WETH and the
/// v2 markets' current fees. v1 and v2 markets stay as they are and keep settling the positions they hold.
///
/// Reads deployments/<chainId>.json and writes the new addresses under `v3` (a dry run writes
/// deployments/<chainId>.v3.dry-run.json instead). `v3.fromBlock` is added from the receipts by v3-plan.mjs.
///
///   forge script script/DeployMarketsV3.s.sol --rpc-url <rpc> --account deployer --broadcast --slow
///
/// Then one timelock operation pair (scripts/mainnet/v3-plan.mjs): callMarket.setRouter, putMarket.setRouter.
/// scripts/mainnet/markets-v3.sh runs all of it.
contract DeployMarketsV3 is Script {
    uint256 internal constant MAINNET = 4663;

    function run() external {
        require(Constants.CALL_TAG == 5 && Constants.PUT_TAG == 6, "v3 ids must use tags 5/6");
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory dep = vm.readFile(path);
        require(!vm.keyExistsJson(dep, ".v3"), "v3 already deployed (remove `v3` from the deployment file to redeploy)");
        require(vm.keyExistsJson(dep, ".v2"), "v3 reuses the v2 AssetRegistry: deploy v2 first");
        address timelock = vm.parseJsonAddress(dep, ".timelock");
        address guardian = vm.parseJsonAddress(dep, ".guardian");
        address weth = vm.parseJsonAddress(dep, ".weth");
        address vault = vm.parseJsonAddress(dep, ".feeVault");
        address registry = vm.parseJsonAddress(dep, ".v2.assetRegistry");
        CallMarket v2calls = CallMarket(vm.parseJsonAddress(dep, ".v2.callMarket"));
        uint32 feePremium = v2calls.feeBpsPremium();
        uint16 feeExercise = v2calls.feeBpsExercise();
        require(timelock.code.length > 0 && guardian.code.length > 0, "timelock/guardian must be contracts");
        require(weth.code.length > 0 && vault.code.length > 0 && registry.code.length > 0, "missing code");
        if (block.chainid == MAINNET) {
            require(TimelockController(payable(timelock)).getMinDelay() >= 10 minutes, "timelock delay");
        }

        vm.startBroadcast();
        OptionNFT nft = new OptionNFT();
        CallMarket calls = new CallMarket(
            IAssetRegistry(registry), IOptionNFT(address(nft)), IERC20(weth), vault, timelock, guardian, feePremium, feeExercise
        );
        PutMarket puts = new PutMarket(
            IAssetRegistry(registry), IOptionNFT(address(nft)), IERC20(weth), vault, timelock, guardian, feePremium, feeExercise
        );
        nft.setMarkets(address(calls), address(puts)); // locked from here on
        Router router = new Router(IWETH(weth), calls, puts);
        vm.stopBroadcast();

        string memory k = "v3";
        vm.serializeAddress(k, "assetRegistry", registry);
        vm.serializeAddress(k, "optionNft", address(nft));
        vm.serializeAddress(k, "callMarket", address(calls));
        vm.serializeAddress(k, "putMarket", address(puts));
        string memory v3 = vm.serializeAddress(k, "router", address(router));
        console2.log("fees (bps) premium / exercise:", feePremium, feeExercise);
        bool dry = !vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.isContext(VmSafe.ForgeContext.ScriptResume);
        if (dry) {
            string memory out = string.concat("deployments/", vm.toString(block.chainid), ".v3.dry-run.json");
            vm.writeJson(v3, out);
            console2.log("dry run written to", out);
        } else {
            vm.writeJson(v3, path, ".v3");
            console2.log("v3 written into", path);
        }
    }
}
