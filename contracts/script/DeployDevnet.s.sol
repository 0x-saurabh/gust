// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
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
import {MockERC20, MockWETH} from "../test/mocks/Mocks.sol";
import {HookDeployer} from "./HookDeployer.sol";

// Uniswap v4 is compiled with solc 0.8.26, so this 0.8.28 script talks to it through ABI-identical lite types
// and deploys it from artifacts (vm.getCode). `Currency` is a value type over `address`, so the layout matches.
struct PoolKeyLite {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct ModifyLiquidityParamsLite {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

interface IPoolManagerLite {
    function initialize(PoolKeyLite memory key, uint160 sqrtPriceX96) external returns (int24);
}

interface IModifyLiquidityLite {
    function modifyLiquidity(PoolKeyLite memory key, ModifyLiquidityParamsLite memory params, bytes memory hookData)
        external
        payable
        returns (int256);
}

/// @notice Local devnet only (anvil, chain 31337): deploys the whole protocol with mock WETH, three listed
/// tokens, a $KYTE token, a **real Uniswap v4 PoolManager + WETH/KYTE pool** behind the buyback, then seeds
/// offers and stakes. Admin roles are plain anvil accounts.
///
///   anvil --port 8547 --chain-id 31337
///   forge script script/DeployDevnet.s.sol --rpc-url http://127.0.0.1:8547 --broadcast
///   DEV_WALLET=0xYourMetaMask ...   # optional: also funds your own wallet
contract DeployDevnet is Script {
    // anvil's well-known default accounts (devnet only)
    uint256 constant K0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80; // admin/keeper
    uint256 constant K1 = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d; // seller A
    uint256 constant K2 = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a; // seller B
    uint256 constant K3 = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6; // buyer
    address constant OPS = 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720; // anvil #9

    uint24 constant POOL_FEE = 3000;
    int24 constant TICK_SPACING = 60;

    struct D {
        MockWETH weth;
        MockERC20 zeph;
        MockERC20 gale;
        MockERC20 nimb;
        MockERC20 kyte;
        AssetRegistry registry;
        OptionNFT nft;
        FeeVault vault;
        CallMarket calls;
        PutMarket puts;
        StakingPool pool;
        address poolManager;
        address lpRouter;
        address swapRouter;
        address hook;
        address adapter;
        BuybackBurner burner;
        Router router;
        PoolKeyLite kytePool;
        PoolKeyLite zephPool;
        PoolKeyLite galePool;
        PoolKeyLite nimbPool;
    }

    function run() external {
        require(block.chainid == 31337, "devnet script: anvil only");
        address admin = vm.addr(K0);
        address sellerA = vm.addr(K1);
        address sellerB = vm.addr(K2);
        address buyer = vm.addr(K3);
        address dev = vm.envOr("DEV_WALLET", address(0));

        D memory d;
        vm.startBroadcast(K0);
        d.weth = new MockWETH();
        d.zeph = new MockERC20("Zephyr", "ZEPH", 18);
        d.gale = new MockERC20("Gale", "GALE", 18);
        d.nimb = new MockERC20("Nimbus", "NIMB", 6);
        d.kyte = new MockERC20("Kyte", "KYTE", 18);

        d.registry = new AssetRegistry(admin, admin);
        d.nft = new OptionNFT();
        d.vault = new FeeVault(IERC20(address(d.weth)), admin, admin);
        d.calls = new CallMarket(
            IAssetRegistry(address(d.registry)),
            IOptionNFT(address(d.nft)),
            IERC20(address(d.weth)),
            address(d.vault),
            admin,
            admin,
            300,
            10
        );
        d.puts = new PutMarket(
            IAssetRegistry(address(d.registry)),
            IOptionNFT(address(d.nft)),
            IERC20(address(d.weth)),
            address(d.vault),
            admin,
            admin,
            300,
            10
        );
        d.nft.setMarkets(address(d.calls), address(d.puts));
        d.pool = new StakingPool(IERC20(address(d.kyte)), IERC20(address(d.weth)), address(d.vault), admin, admin);
        (d.poolManager, d.adapter) = _deployV4(d, admin);
        d.burner = new BuybackBurner(IERC20(address(d.weth)), IERC20(address(d.kyte)), admin, admin, admin);
        d.router = new Router(IWETH(address(d.weth)), d.calls, d.puts);

        // timelock actions (admin is the timelock on devnet)
        d.registry.addAsset(address(d.zeph), type(uint256).max, 0.001 ether);
        d.registry.addAsset(address(d.gale), type(uint256).max, 0.001 ether);
        d.registry.addAsset(address(d.nimb), type(uint256).max, 0.001 ether);
        d.registry.setPutsEnabled(address(d.zeph), true);
        d.registry.setPutsEnabled(address(d.gale), true);
        d.vault.setDestinations(address(d.pool), address(d.burner), OPS);
        d.calls.setRouter(address(d.router));
        d.puts.setRouter(address(d.router));
        d.burner.setAdapter(ISwapAdapter(d.adapter));
        d.burner.setBounds(5 ether, 500);

        // fund the seeded actors (and your wallet, if given)
        address[4] memory who = [sellerA, sellerB, buyer, dev];
        for (uint256 i; i < who.length; ++i) {
            if (who[i] == address(0)) continue;
            d.zeph.mint(who[i], 10_000_000e18);
            d.gale.mint(who[i], 100_000e18);
            d.nimb.mint(who[i], 1_000_000e6);
            d.kyte.mint(who[i], 50_000_000e18);
            d.weth.mint(who[i], 100 ether);
            if (who[i] == dev) payable(dev).transfer(500 ether);
        }
        vm.stopBroadcast();

        _seedOffers(d, K1, K2, K3);
        _write(d);
    }

    /// @dev Real Uniswap v4: PoolManager, a swap router, and a WETH pool with full range liquidity for $KYTE
    /// (1 WETH = 1,000,000 KYTE) and for every listed token, so the price feed and the buyback are real swaps.
    function _deployV4(D memory d, address admin) internal returns (address manager, address adapter) {
        manager = _create(vm.getCode("PoolManager.sol:PoolManager"), abi.encode(admin));
        d.lpRouter = _create(vm.getCode("PoolModifyLiquidityTest.sol:PoolModifyLiquidityTest"), abi.encode(manager));
        d.swapRouter = _create(vm.getCode("PoolSwapTest.sol:PoolSwapTest"), abi.encode(manager));
        d.poolManager = manager;

        // KyteHook at a mined CREATE2 address (v4 reads its permissions from the address bits).
        // Owner = admin (the devnet timelock); fee 10 bps of every swap on hooked pools goes to the FeeVault.
        HookDeployer hd = new HookDeployer();
        bytes memory hookInit = bytes.concat(
            vm.getCode("KyteHook.sol:KyteHook"),
            abi.encode(manager, admin, address(d.vault), uint256(10), address(d.weth))
        );
        (bytes32 salt,) = hd.mine(keccak256(hookInit), 200_000);
        d.hook = hd.deploy(salt, hookInit);

        d.kytePool = _pool(d, admin, manager, address(d.kyte), 1_000_000e18, 40 ether, d.hook);
        d.zephPool = _pool(d, admin, manager, address(d.zeph), 25_000e18, 20 ether, address(0)); // 1 ZEPH = 0.00004 ETH
        d.galePool = _pool(d, admin, manager, address(d.gale), 769e18, 20 ether, address(0)); // 1 GALE = 0.0013 ETH
        d.nimbPool = _pool(d, admin, manager, address(d.nimb), 3_225e6, 20 ether, address(0)); // 1 NIMB = 0.00031 ETH

        adapter = _create(
            vm.getCode("UniswapV4Adapter.sol:UniswapV4Adapter"),
            abi.encode(manager, address(d.weth), address(d.kyte), d.kytePool, d.hook)
        );
    }

    /// @dev Initializes a WETH/token pool at `tokensPerEthRaw` and seeds it with ~`wethSide` WETH of full range liquidity.
    function _pool(
        D memory d,
        address admin,
        address manager,
        address token,
        uint256 tokensPerEthRaw,
        uint256 wethSide,
        address hooks
    ) internal returns (PoolKeyLite memory key) {
        bool wethIs0 = address(d.weth) < token;
        key = PoolKeyLite({
            currency0: wethIs0 ? address(d.weth) : token,
            currency1: wethIs0 ? token : address(d.weth),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: hooks
        });
        // price = raw currency1 per raw currency0; sqrtPriceX96 = sqrt(price) * 2^96
        (uint256 num, uint256 den) = wethIs0 ? (tokensPerEthRaw, uint256(1e18)) : (uint256(1e18), tokensPerEthRaw);
        uint160 sqrtPriceX96 = uint160(_sqrt(num * 1e36 / den) * 2 ** 96 / 1e18);
        IPoolManagerLite(manager).initialize(key, sqrtPriceX96);

        uint256 liquidity = wethIs0 ? wethSide * sqrtPriceX96 / 2 ** 96 : wethSide * 2 ** 96 / sqrtPriceX96;
        uint256 tokenSide = wethSide * tokensPerEthRaw / 1e18;
        d.weth.mint(admin, wethSide * 2);
        MockERC20(token).mint(admin, tokenSide * 2);
        d.weth.approve(d.lpRouter, type(uint256).max);
        MockERC20(token).approve(d.lpRouter, type(uint256).max);
        IModifyLiquidityLite(d.lpRouter)
            .modifyLiquidity(
                key,
                ModifyLiquidityParamsLite({
                    tickLower: -887_220, tickUpper: 887_220, liquidityDelta: int256(liquidity), salt: 0
                }),
                ""
            );
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

    function _create(bytes memory creationCode, bytes memory args) internal returns (address addr) {
        bytes memory code = bytes.concat(creationCode, args);
        assembly {
            addr := create(0, add(code, 0x20), mload(code))
        }
        require(addr != address(0), "create failed");
    }

    function _seedOffers(D memory d, uint256 kA, uint256 kB, uint256 kBuyer) internal {
        uint64 now_ = uint64(block.timestamp);

        vm.startBroadcast(kA);
        _approveAll(d);
        d.calls.createOffer(address(d.zeph), 200_000e18, 10 ether, 0.3 ether, now_ + 7 days, now_ + 2 days);
        d.calls.createOffer(address(d.nimb), 12_000e6, 4.5 ether, 0.2 ether, now_ + 3 days, now_ + 1 days);
        d.puts.createPutOffer(address(d.zeph), 150_000e18, 5 ether, 0.2 ether, now_ + 5 days, now_ + 2 days);
        uint256 toFill =
            d.calls.createOffer(address(d.zeph), 100_000e18, 4 ether, 0.2 ether, now_ + 2 days, now_ + 1 days);
        d.pool.stake(2_500_000e18);
        vm.stopBroadcast();

        vm.startBroadcast(kB);
        _approveAll(d);
        d.calls.createOffer(address(d.gale), 2_000e18, 3 ether, 0.15 ether, now_ + 14 days, now_ + 2 days);
        d.calls.createOffer(address(d.gale), 800e18, 1.5 ether, 0.05 ether, now_ + 30 days, now_ + 3 days);
        d.puts.createPutOffer(address(d.gale), 1_500e18, 1.7 ether, 0.1 ether, now_ + 10 days, now_ + 2 days);
        d.pool.stake(1_000_000e18);
        vm.stopBroadcast();

        vm.startBroadcast(kBuyer);
        _approveAll(d);
        d.calls.buy(toFill, 0.2 ether);
        vm.stopBroadcast();
    }

    function _approveAll(D memory d) internal {
        d.zeph.approve(address(d.calls), type(uint256).max);
        d.gale.approve(address(d.calls), type(uint256).max);
        d.nimb.approve(address(d.calls), type(uint256).max);
        d.zeph.approve(address(d.puts), type(uint256).max);
        d.gale.approve(address(d.puts), type(uint256).max);
        d.weth.approve(address(d.calls), type(uint256).max);
        d.weth.approve(address(d.puts), type(uint256).max);
        d.kyte.approve(address(d.pool), type(uint256).max);
    }

    function _poolJson(string memory name, PoolKeyLite memory key) internal returns (string memory) {
        string memory o = string.concat("pool-", name);
        vm.serializeAddress(o, "currency0", key.currency0);
        vm.serializeAddress(o, "currency1", key.currency1);
        vm.serializeUint(o, "fee", key.fee);
        vm.serializeInt(o, "tickSpacing", key.tickSpacing);
        return vm.serializeAddress(o, "hooks", key.hooks);
    }

    function _write(D memory d) internal {
        string memory k = "dep";
        vm.serializeAddress(k, "weth", address(d.weth));
        vm.serializeAddress(k, "assetRegistry", address(d.registry));
        vm.serializeAddress(k, "optionNft", address(d.nft));
        vm.serializeAddress(k, "feeVault", address(d.vault));
        vm.serializeAddress(k, "callMarket", address(d.calls));
        vm.serializeAddress(k, "putMarket", address(d.puts));
        vm.serializeAddress(k, "stakingPool", address(d.pool));
        vm.serializeAddress(k, "buybackBurner", address(d.burner));
        vm.serializeAddress(k, "router", address(d.router));
        vm.serializeAddress(k, "kyteToken", address(d.kyte));
        vm.serializeAddress(k, "opsSafe", OPS);
        vm.serializeAddress(k, "uniswapV4PoolManager", d.poolManager);
        vm.serializeAddress(k, "uniswapV4SwapRouter", d.swapRouter);
        vm.serializeAddress(k, "kyteHook", d.hook);
        vm.serializeAddress(k, "swapAdapter", d.adapter);
        string memory tk = "tokens";
        vm.serializeAddress(tk, "ZEPH", address(d.zeph));
        vm.serializeAddress(tk, "GALE", address(d.gale));
        string memory tokens = vm.serializeAddress(tk, "NIMB", address(d.nimb));
        vm.serializeString(k, "tokens", tokens);
        string memory pk = "pools";
        vm.serializeString(pk, "KYTE", _poolJson("KYTE", d.kytePool));
        vm.serializeString(pk, "ZEPH", _poolJson("ZEPH", d.zephPool));
        vm.serializeString(pk, "GALE", _poolJson("GALE", d.galePool));
        string memory pools = vm.serializeString(pk, "NIMB", _poolJson("NIMB", d.nimbPool));
        string memory json = vm.serializeString(k, "pools", pools);
        vm.writeJson(json, "deployments/31337.json");
        console2.log("devnet deployed (real Uniswap v4 pool); written to deployments/31337.json");
    }
}
