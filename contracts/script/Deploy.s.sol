// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, VmSafe, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {BuybackBurner} from "../src/BuybackBurner.sol";
import {CallMarket} from "../src/CallMarket.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {OptionNFT} from "../src/OptionNFT.sol";
import {PutMarket} from "../src/PutMarket.sol";
import {Router} from "../src/Router.sol";
import {StakingPool} from "../src/StakingPool.sol";
import {IAssetRegistry} from "../src/interfaces/IAssetRegistry.sol";
import {IOptionNFT} from "../src/interfaces/IOptionNFT.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";
import {IWETH} from "../src/interfaces/IWETH.sol";
import {HookDeployer} from "./HookDeployer.sol";

/// @notice Full deployment in SPEC.md §14 order, for testnet and mainnet. Writes deployments/<chainId>.json.
///
/// Required env:  GUARDIAN, WETH, KYTE_TOKEN, KEEPER, OPS_SAFE, POOL_MANAGER (Uniswap v4, for KyteHook)
/// Timelock:      TIMELOCK (existing) — or ADMIN_SAFE to deploy a 48 h TimelockController owned by that Safe
/// Optional:      SWAP_ADAPTER, FEE_BPS_PREMIUM (300), FEE_BPS_EXERCISE (10), TIMELOCK_DELAY (172800)
///
///   forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --account <keystore> --verify
///
/// After deploy, these are timelock proposals (SPEC.md §14 step 5): registry.addAsset / setPutsEnabled,
/// feeVault.setDestinations, callMarket.setRouter, putMarket.setRouter, buybackBurner.setAdapter / setKeeper.
/// If the deployer *is* the timelock (rehearsals only), the script runs that wiring itself.
contract Deploy is Script {
    uint256 internal constant MAINNET = 4663;
    /// @dev Shortest timelock delay accepted on mainnet. Set TIMELOCK_DELAY (seconds) at or above this.
    uint256 internal constant MAINNET_MIN_DELAY = 10 minutes;

    struct Out {
        address timelock;
        AssetRegistry registry;
        OptionNFT nft;
        FeeVault vault;
        CallMarket calls;
        PutMarket puts;
        StakingPool pool;
        BuybackBurner burner;
        Router router;
        address hook;
    }

    function run() external {
        address guardian = vm.envAddress("GUARDIAN");
        address weth = vm.envAddress("WETH");
        address kyte = vm.envAddress("KYTE_TOKEN");
        address keeper = vm.envAddress("KEEPER");
        address ops = vm.envAddress("OPS_SAFE");
        address adapter = vm.envOr("SWAP_ADAPTER", address(0));
        uint32 feePremium = uint32(vm.envOr("FEE_BPS_PREMIUM", uint256(300)));
        uint16 feeExercise = uint16(vm.envOr("FEE_BPS_EXERCISE", uint256(10)));
        require(weth.code.length > 0, "WETH has no code on this chain");
        require(kyte.code.length > 0, "KYTE_TOKEN has no code on this chain");
        require(keeper != address(0), "KEEPER is zero");
        _checkProductionRoles(guardian, ops);

        Out memory o;
        vm.startBroadcast();
        // The wallet actually signing (from --account), not the script contract's default msg.sender.
        (, address deployer,) = vm.readCallers();
        o.timelock = _timelock();
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
        o.pool = new StakingPool(IERC20(kyte), IERC20(weth), address(o.vault), o.timelock, guardian);
        o.burner = new BuybackBurner(IERC20(weth), IERC20(kyte), keeper, o.timelock, guardian);
        o.router = new Router(IWETH(weth), o.calls, o.puts);
        // KyteHook (Uniswap v4): TWAP oracle + 10 bps swap fee into the FeeVault, at a mined address.
        HookDeployer hd = new HookDeployer();
        bytes memory hookInit = bytes.concat(
            vm.getCode("KyteHook.sol:KyteHook"),
            abi.encode(vm.envAddress("POOL_MANAGER"), o.timelock, address(o.vault), uint256(10), weth)
        );
        (bytes32 salt,) = hd.mine(keccak256(hookInit), 400_000);
        o.hook = hd.deploy(salt, hookInit);

        if (o.timelock == deployer) {
            require(block.chainid != MAINNET, "mainnet: deployer can't be the timelock");
            o.vault.setDestinations(address(o.pool), address(o.burner), ops);
            o.calls.setRouter(address(o.router));
            o.puts.setRouter(address(o.router));
            if (adapter != address(0)) o.burner.setAdapter(ISwapAdapter(adapter));
            console2.log("deployer is the timelock: post-deploy wiring done in-script (rehearsal mode)");
        } else {
            console2.log("post-deploy wiring must go through the timelock (see script header)");
        }
        vm.stopBroadcast();

        _write(o, weth, kyte, guardian, keeper, ops, adapter);
    }

    /// @dev On mainnet every admin role must be a contract (a Safe or the TimelockController), never a plain
    /// key, and rehearsal mode (deployer = timelock) is refused. Testnets may still rehearse.
    function _checkProductionRoles(address guardian, address ops) internal view {
        if (block.chainid != MAINNET) return;
        require(_isRealContract(guardian), "mainnet: GUARDIAN must be a Safe (not an EOA or a 7702 delegation)");
        require(_isRealContract(ops), "mainnet: OPS_SAFE must be a Safe (not an EOA or a 7702 delegation)");
        address existing = vm.envOr("TIMELOCK", address(0));
        if (existing != address(0)) {
            require(_isRealContract(existing), "mainnet: TIMELOCK must be a TimelockController");
            require(
                TimelockController(payable(existing)).getMinDelay() >= MAINNET_MIN_DELAY,
                "mainnet: timelock delay < 10 min"
            );
        } else {
            require(
                _isRealContract(vm.envAddress("ADMIN_SAFE")),
                "mainnet: ADMIN_SAFE must be a Safe (not an EOA or a 7702 delegation)"
            );
            require(
                vm.envOr("TIMELOCK_DELAY", uint256(48 hours)) >= MAINNET_MIN_DELAY, "mainnet: TIMELOCK_DELAY < 10 min"
            );
        }
    }

    /// @dev Deployed bytecode, and not an EIP-7702 delegation designator (0xef0100 || address, 23 bytes), which
    /// any single key can set on its own account and which would otherwise pass a plain `code.length > 0` check.
    function _isRealContract(address a) internal view returns (bool) {
        bytes memory code = a.code;
        if (code.length == 0) return false;
        if (code.length == 23 && code[0] == 0xef && code[1] == 0x01 && code[2] == 0x00) return false;
        return true;
    }

    /// @dev Reuse TIMELOCK if given; otherwise deploy a TimelockController run by ADMIN_SAFE.
    function _timelock() internal returns (address) {
        address existing = vm.envOr("TIMELOCK", address(0));
        if (existing != address(0)) return existing;
        address adminSafe = vm.envAddress("ADMIN_SAFE");
        uint256 delay = vm.envOr("TIMELOCK_DELAY", uint256(48 hours));
        address[] memory proposers = new address[](1);
        proposers[0] = adminSafe;
        address[] memory executors = new address[](1);
        executors[0] = adminSafe;
        // admin = address(0): the timelock administers itself; only the Safe can propose/execute.
        TimelockController tl = new TimelockController(delay, proposers, executors, address(0));
        console2.log("TimelockController deployed", address(tl));
        return address(tl);
    }

    function _write(
        Out memory o,
        address weth,
        address kyte,
        address guardian,
        address keeper,
        address ops,
        address adapter
    ) internal {
        string memory k = "dep";
        vm.serializeAddress(k, "weth", weth);
        vm.serializeAddress(k, "kyteToken", kyte);
        vm.serializeAddress(k, "timelock", o.timelock);
        vm.serializeAddress(k, "guardian", guardian);
        vm.serializeAddress(k, "keeper", keeper);
        vm.serializeAddress(k, "opsSafe", ops);
        vm.serializeAddress(k, "swapAdapter", adapter);
        vm.serializeAddress(k, "uniswapV4PoolManager", vm.envAddress("POOL_MANAGER"));
        vm.serializeAddress(k, "assetRegistry", address(o.registry));
        vm.serializeAddress(k, "optionNft", address(o.nft));
        vm.serializeAddress(k, "feeVault", address(o.vault));
        vm.serializeAddress(k, "callMarket", address(o.calls));
        vm.serializeAddress(k, "putMarket", address(o.puts));
        vm.serializeAddress(k, "stakingPool", address(o.pool));
        vm.serializeAddress(k, "buybackBurner", address(o.burner));
        vm.serializeAddress(k, "router", address(o.router));
        string memory json = vm.serializeAddress(k, "kyteHook", o.hook);
        // A simulation must never overwrite the real deployment file (the indexer, keeper and site read it).
        bool dry = !vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.isContext(VmSafe.ForgeContext.ScriptResume);
        string memory path = string.concat("deployments/", vm.toString(block.chainid), dry ? ".dry-run.json" : ".json");
        vm.writeJson(json, path);
        console2.log("written to", path);
    }
}
