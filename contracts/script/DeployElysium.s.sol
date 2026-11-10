// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, VmSafe, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {CallMarket} from "../src/CallMarket.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {OptionNFT} from "../src/OptionNFT.sol";
import {PutMarket} from "../src/PutMarket.sol";
import {RewardSink} from "../src/RewardSink.sol";
import {Router} from "../src/Router.sol";
import {IAssetRegistry} from "../src/interfaces/IAssetRegistry.sol";
import {IOptionNFT} from "../src/interfaces/IOptionNFT.sol";
import {IWETH} from "../src/interfaces/IWETH.sol";

/// @notice Kyte on a second chain without $KYTE (Elysium 99901, docs/ELYSIUM.md): the option markets with WHYPE as
/// the quote asset, a FeeVault, a Router, and a RewardSink standing in for StakingPool and BuybackBurner until the
/// token is bridged. No KyteHook (no KYTE pool yet). Writes deployments/<chainId>.json.
///
/// Required env:  GUARDIAN (Safe), OPS_SAFE (Safe), WETH (the wrapped gas token, WHYPE on Elysium)
/// Timelock:      TIMELOCK (existing) — or ADMIN_SAFE to deploy a TimelockController owned by that Safe
/// Optional:      TIMELOCK_DELAY (600), FEE_BPS_PREMIUM (300), FEE_BPS_EXERCISE (10), POOL_MANAGER (recorded only),
///                KEEPER (recorded only)
///
///   forge script script/DeployElysium.s.sol --rpc-url elysium --account deployer --broadcast --slow
///
/// Post-deploy wiring is timelock work from the admin Safe (scripts/mainnet/timelock-calldata.mjs):
/// feeVault.setDestinations(sink, sink, ops), callMarket.setRouter, putMarket.setRouter, registry.addAsset.
contract DeployElysium is Script {
    uint256 internal constant MIN_DELAY = 10 minutes;

    struct Out {
        address timelock;
        AssetRegistry registry;
        OptionNFT nft;
        FeeVault vault;
        CallMarket calls;
        PutMarket puts;
        RewardSink sink;
        Router router;
    }

    function run() external {
        address guardian = vm.envAddress("GUARDIAN");
        address weth = vm.envAddress("WETH");
        address ops = vm.envAddress("OPS_SAFE");
        uint32 feePremium = uint32(vm.envOr("FEE_BPS_PREMIUM", uint256(300)));
        uint16 feeExercise = uint16(vm.envOr("FEE_BPS_EXERCISE", uint256(10)));
        require(weth.code.length > 0, "WETH has no code on this chain");
        require(_isRealContract(guardian), "GUARDIAN must be a Safe");
        require(_isRealContract(ops), "OPS_SAFE must be a Safe");

        Out memory o;
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        o.timelock = _timelock();
        require(o.timelock != deployer, "deployer can't be the timelock");
        o.registry = new AssetRegistry(o.timelock, guardian);
        o.nft = new OptionNFT();
        o.vault = new FeeVault(IERC20(weth), o.timelock, guardian);
        o.calls = new CallMarket(
            IAssetRegistry(address(o.registry)),
            IOptionNFT(address(o.nft)),
            IERC20(weth),
            address(o.vault),
            o.timelock,
            guardian,
            feePremium,
            feeExercise
        );
        o.puts = new PutMarket(
            IAssetRegistry(address(o.registry)),
            IOptionNFT(address(o.nft)),
            IERC20(weth),
            address(o.vault),
            o.timelock,
            guardian,
            feePremium,
            feeExercise
        );
        o.nft.setMarkets(address(o.calls), address(o.puts)); // locked from here on
        o.sink = new RewardSink(IERC20(weth), o.timelock, guardian);
        o.router = new Router(IWETH(weth), o.calls, o.puts);
        vm.stopBroadcast();
        console2.log("post-deploy wiring goes through the timelock (see script header)");

        _write(o, weth, guardian, ops);
    }

    function _isRealContract(address a) internal view returns (bool) {
        if (a.code.length == 0) return false;
        bytes memory code = a.code;
        // EIP-7702 delegation designators are 23 bytes starting 0xef0100; a Safe is never that.
        return !(code.length == 23 && code[0] == 0xef && code[1] == 0x01 && code[2] == 0x00);
    }

    function _timelock() internal returns (address) {
        address existing = vm.envOr("TIMELOCK", address(0));
        if (existing != address(0)) {
            require(TimelockController(payable(existing)).getMinDelay() >= MIN_DELAY, "timelock delay < 10 min");
            return existing;
        }
        address adminSafe = vm.envAddress("ADMIN_SAFE");
        require(_isRealContract(adminSafe), "ADMIN_SAFE must be a Safe");
        uint256 delay = vm.envOr("TIMELOCK_DELAY", uint256(MIN_DELAY));
        require(delay >= MIN_DELAY, "TIMELOCK_DELAY < 10 min");
        address[] memory proposers = new address[](1);
        proposers[0] = adminSafe;
        address[] memory executors = new address[](1);
        executors[0] = adminSafe;
        TimelockController tl = new TimelockController(delay, proposers, executors, address(0));
        console2.log("TimelockController deployed", address(tl));
        return address(tl);
    }

    function _write(Out memory o, address weth, address guardian, address ops) internal {
        string memory k = "dep";
        vm.serializeAddress(k, "weth", weth);
        vm.serializeAddress(k, "timelock", o.timelock);
        vm.serializeAddress(k, "guardian", guardian);
        vm.serializeAddress(k, "keeper", vm.envOr("KEEPER", address(0)));
        vm.serializeAddress(k, "opsSafe", ops);
        vm.serializeAddress(k, "uniswapV4PoolManager", vm.envOr("POOL_MANAGER", address(0)));
        vm.serializeAddress(k, "assetRegistry", address(o.registry));
        vm.serializeAddress(k, "optionNft", address(o.nft));
        vm.serializeAddress(k, "feeVault", address(o.vault));
        vm.serializeAddress(k, "callMarket", address(o.calls));
        vm.serializeAddress(k, "putMarket", address(o.puts));
        // Until $KYTE is on this chain both FeeVault shares land in the sink (docs/ELYSIUM.md).
        vm.serializeAddress(k, "stakingPool", address(o.sink));
        vm.serializeAddress(k, "buybackBurner", address(o.sink));
        vm.serializeAddress(k, "rewardSink", address(o.sink));
        vm.serializeUint(k, "deployBlock", block.number);
        string memory json = vm.serializeAddress(k, "router", address(o.router));
        bool dry = !vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.isContext(VmSafe.ForgeContext.ScriptResume);
        string memory path = string.concat("deployments/", vm.toString(block.chainid), dry ? ".dry-run.json" : ".json");
        vm.writeJson(json, path);
        console2.log("written to", path);
    }
}
