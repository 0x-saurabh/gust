// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, VmSafe, console2} from "forge-std/Script.sol";

/// @notice Step 2 of a testnet/mainnet deploy, after Deploy.s.sol: the $KYTE/WETH Uniswap v4 pool behind the
/// buyback, hooked with KyteHook, and the UniswapV4Adapter that BuybackBurner swaps through. Reads
/// deployments/<chainId>.json (weth, kyteToken, kyteHook) and writes swapAdapter + pools back into it.
///
/// Required env:  POOL_MANAGER (Uniswap v4), KYTE_PER_ETH (raw $KYTE units per 1 ETH, for the opening price)
/// Optional:      POOL_FEE (3000), TICK_SPACING (60), SKIP_INIT=true (pool already initialized with the hook)
///
///   POOL_MANAGER=0x8366a39CC670B4001A1121B8F6A443A643e40951 KYTE_PER_ETH=1000000000000000000000000 \
///     forge script script/DeployAdapter.s.sol --rpc-url robinhood --broadcast --account deployer
///
/// Liquidity is added afterwards through the Uniswap interface or a position manager; this script only
/// initializes the pool so the adapter and the hook's TWAP have a pool id to point at.
struct PoolKeyLite {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

interface IPoolManagerLite {
    function initialize(PoolKeyLite memory key, uint160 sqrtPriceX96) external returns (int24);
    function extsload(bytes32 slot) external view returns (bytes32);
}

contract DeployAdapter is Script {
    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory dep = vm.readFile(path);
        // Simulations write to a side file so they can't touch the real deployment file.
        bool dry = !vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.isContext(VmSafe.ForgeContext.ScriptResume);
        if (dry) {
            path = string.concat("deployments/", vm.toString(block.chainid), ".dry-run.json");
            vm.writeFile(path, dep);
        }
        address weth = vm.parseJsonAddress(dep, ".weth");
        address kyte = vm.parseJsonAddress(dep, ".kyteToken");
        address hook = vm.parseJsonAddress(dep, ".kyteHook");
        address manager = vm.envAddress("POOL_MANAGER");
        uint256 kytePerEth = vm.envUint("KYTE_PER_ETH");
        uint24 fee = uint24(vm.envOr("POOL_FEE", uint256(3000)));
        int24 spacing = int24(int256(vm.envOr("TICK_SPACING", uint256(60))));
        require(manager.code.length > 0, "POOL_MANAGER has no code");
        require(hook.code.length > 0, "kyteHook has no code: run Deploy.s.sol first");
        require(kytePerEth > 0, "KYTE_PER_ETH must be > 0");

        bool wethIs0 = weth < kyte;
        PoolKeyLite memory key = PoolKeyLite({
            currency0: wethIs0 ? weth : kyte,
            currency1: wethIs0 ? kyte : weth,
            fee: fee,
            tickSpacing: spacing,
            hooks: hook
        });
        // price = raw currency1 per raw currency0; sqrtPriceX96 = sqrt(price) * 2^96
        (uint256 num, uint256 den) = wethIs0 ? (kytePerEth, uint256(1e18)) : (uint256(1e18), kytePerEth);
        uint160 sqrtPriceX96 = uint160(_sqrt(num * 1e36 / den) * 2 ** 96 / 1e18);

        // Already initialized? Read slot0 straight from the PoolManager (pools mapping lives at slot 6) instead of
        // sending an initialize() that would revert.
        bytes32 poolId = keccak256(abi.encode(key));
        bytes32 slot0 = IPoolManagerLite(manager).extsload(keccak256(abi.encodePacked(poolId, bytes32(uint256(6)))));
        bool initialized = uint160(uint256(slot0)) != 0;
        console2.log("pool id", vm.toString(poolId));

        vm.startBroadcast();
        if (initialized || vm.envOr("SKIP_INIT", false)) {
            console2.log("pool already initialized: skipping initialize()");
        } else {
            int24 tick = IPoolManagerLite(manager).initialize(key, sqrtPriceX96);
            console2.log("pool initialized at tick", tick);
        }
        bytes memory code = bytes.concat(
            vm.getCode("UniswapV4Adapter.sol:UniswapV4Adapter"), abi.encode(manager, weth, kyte, key, hook)
        );
        address adapter;
        assembly {
            adapter := create(0, add(code, 0x20), mload(code))
        }
        require(adapter != address(0), "adapter create failed");
        vm.stopBroadcast();
        console2.log("UniswapV4Adapter", adapter);

        // Append to the deployment file (vm.writeJson with a key path updates in place).
        vm.writeJson(vm.toString(adapter), path, ".swapAdapter");
        vm.writeJson(vm.toString(manager), path, ".uniswapV4PoolManager");
        string memory pk = "pool-KYTE";
        vm.serializeAddress(pk, "currency0", key.currency0);
        vm.serializeAddress(pk, "currency1", key.currency1);
        vm.serializeUint(pk, "fee", key.fee);
        vm.serializeInt(pk, "tickSpacing", key.tickSpacing);
        string memory pool = vm.serializeAddress(pk, "hooks", key.hooks);
        if (!vm.keyExistsJson(dep, ".pools")) {
            // fresh deploy file (Deploy.s.sol writes no pools): add the object
            string memory pools = vm.serializeString("pools", "KYTE", pool);
            vm.writeJson(pools, path, ".pools");
        } else if (vm.keyExistsJson(dep, ".pools.KYTE")) {
            vm.writeJson(pool, path, ".pools.KYTE"); // replace only our entry, keep the others
        } else {
            console2.log("NOTE: add this pool under .pools.KYTE by hand:", pool);
        }
        console2.log("written to", path);
        console2.log("next: timelock proposal buybackBurner.setAdapter(adapter) + setBounds, then add liquidity");
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
