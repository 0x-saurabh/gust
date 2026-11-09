// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Errors} from "./lib/Errors.sol";
import {Governed} from "./lib/Governed.sol";

/// @notice Minimal view of FoboHook (fobo.fun, Robinhood Chain): the Uniswap v4 hook that owns every FOBO pool.
/// `PoolKey` mirrors v4-core's struct field for field (Currency and IHooks are addresses in the ABI), so
/// `keccak256(abi.encode(key))` is the pool id FoboHook stores under.
interface IFoboHook {
    struct PoolKey {
        address currency0; // the quote; address(0) = ETH
        address currency1; // the token
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    function keyFor(address quote, address token) external view returns (PoolKey memory);
    /// @dev The public getter of `mapping(PoolId => Pool) pools`: 15 value fields (the struct's fixed array is
    /// omitted by the compiler). Only the first three are read here, through a raw staticcall.
    function pools(bytes32 id) external view;
    /// @return tickF the floor tick
    /// @return sqrtPriceX96 the worst-case price if every holder sells (token per quote, Q64.96 square root)
    /// @return circulating tokens held outside the pool
    function floorOf(PoolKey calldata key)
        external
        view
        returns (int24 tickF, uint160 sqrtPriceX96, uint256 circulating);
}

interface IRegistryListedF {
    function getAsset(address token)
        external
        view
        returns (bool listed, bool enabled, bool putsEnabled, uint8 decimals, uint256 cap, uint256 minStrike);
}

/// @title FoboLister
/// @notice Permissionless listing of FOBO launchpad tokens on Kyte. FOBO has no graduation: every token launches with
/// its whole supply as liquidity and a floor that only rises. So the bar here is the floor itself: anyone calls
/// `list(token)` once the token is quoted in ETH, is at least `minAge` old (past the launch tax window and the first
/// day of trading) and its floor backs at least `minFloorQuote` of ETH for the tokens in circulation (the same 4.2 ETH
/// bar Pons graduation uses). The lister then schedules `AssetRegistry.addAssets` through the protocol timelock with
/// a cap derived from supply and puts on or off as configured. After the delay anyone calls `execute(token)`.
///
/// The lister holds the timelock's proposer and executor roles, but the only call it can ever propose is the
/// `addAssets` it builds itself, so the roles grant nothing beyond "list a FOBO token that clears the bar". The
/// timelock keeps every other right (cap formula, bars, puts default, minimum strike) and the guardian can pause.
contract FoboLister is Governed {
    uint256 internal constant Q96 = 1 << 96;

    TimelockController public immutable timelockController;
    address public immutable registry;
    IFoboHook public immutable hook;

    /// @notice Cap per listing as a share of total supply, in basis points (200 = 2%).
    uint256 public capBps;
    /// @notice Minimum total strike (wei) written into each listing.
    uint256 public minStrike;
    /// @notice Seconds since launch before a token qualifies (default 24 h).
    uint256 public minAge;
    /// @notice The floor must back at least this much quote (wei of ETH) for the circulating tokens (default 4.2 ETH).
    uint256 public minFloorQuote;
    /// @notice Whether listings enable puts at once. FOBO's floor bounds a put writer's loss, so the default is on.
    bool public putsOn;

    /// @notice Timelock operation id per token once scheduled; zero until then.
    mapping(address token => bytes32) public operationOf;
    mapping(address token => bytes32) public saltOf;
    /// @notice Frozen at scheduling; execution replays exactly what was scheduled.
    mapping(address token => uint256) public capOf;
    mapping(address token => uint256) public minStrikeOf;
    mapping(address token => bool) public putsOf;
    /// @dev Makes every scheduled operation id unique, even for the same token after a reset.
    uint256 public nonce;

    event ListingScheduled(
        address indexed token, bytes32 indexed operationId, uint256 cap, uint256 minStrike, bool puts, uint256 readyAt
    );
    event ListingExecuted(address indexed token, bytes32 indexed operationId);
    event CapBpsChanged(uint256 oldValue, uint256 newValue);
    event MinStrikeChanged(uint256 oldValue, uint256 newValue);
    event MinAgeChanged(uint256 oldValue, uint256 newValue);
    event MinFloorQuoteChanged(uint256 oldValue, uint256 newValue);
    event PutsOnChanged(bool oldValue, bool newValue);

    error NotFoboToken();
    error NotEthQuote();
    error TooYoung();
    error FloorTooLow();
    error BadDecimals();
    error AlreadyListed();
    error AlreadyScheduled();
    error NotScheduled();
    error BadBps();

    constructor(
        address timelock_,
        address guardian_,
        address registry_,
        address hook_,
        uint256 capBps_,
        uint256 minStrike_,
        uint256 minAge_,
        uint256 minFloorQuote_,
        bool putsOn_
    ) Governed(timelock_, guardian_) {
        if (registry_ == address(0) || hook_ == address(0)) revert Errors.ZeroAddress();
        if (capBps_ == 0 || capBps_ > 10_000) revert BadBps();
        timelockController = TimelockController(payable(timelock_));
        registry = registry_;
        hook = IFoboHook(hook_);
        capBps = capBps_;
        minStrike = minStrike_;
        minAge = minAge_;
        minFloorQuote = minFloorQuote_;
        putsOn = putsOn_;
    }

    // ---------------------------------------------------------------- listing

    /// @notice Checks a FOBO token and schedules its listing through the timelock. Anyone may call.
    /// @return operationId the timelock operation; `execute(token)` runs it after the delay.
    function list(address token) external whenNotPaused returns (bytes32 operationId) {
        if (operationOf[token] != bytes32(0)) revert AlreadyScheduled();
        (uint256 cap,) = check(token);
        bytes memory data = _calldata(token, cap, minStrike, putsOn);
        bytes32 salt = keccak256(abi.encodePacked("fobo-lister", token, ++nonce));
        uint256 delay = timelockController.getMinDelay();
        operationId = timelockController.hashOperation(registry, 0, data, bytes32(0), salt);
        timelockController.schedule(registry, 0, data, bytes32(0), salt, delay);
        operationOf[token] = operationId;
        saltOf[token] = salt;
        capOf[token] = cap;
        minStrikeOf[token] = minStrike;
        putsOf[token] = putsOn;
        emit ListingScheduled(token, operationId, cap, minStrike, putsOn, block.timestamp + delay);
    }

    /// @notice Executes a scheduled listing once the timelock delay has passed. Anyone may call.
    function execute(address token) external {
        bytes32 operationId = operationOf[token];
        if (operationId == bytes32(0)) revert NotScheduled();
        bytes memory data = _calldata(token, capOf[token], minStrikeOf[token], putsOf[token]);
        timelockController.execute(registry, 0, data, bytes32(0), saltOf[token]);
        emit ListingExecuted(token, operationId);
    }

    /// @notice Every condition a token must meet, as a view. Reverts with the first failing one.
    /// @return cap the listing cap in token units
    /// @return floorQuote what the floor backs, in wei of ETH
    function check(address token) public view returns (uint256 cap, uint256 floorQuote) {
        IFoboHook.PoolKey memory key = hook.keyFor(address(0), token);
        (address poolToken, uint40 launchedAt) = _pool(keccak256(abi.encode(key)));
        if (poolToken != token || launchedAt == 0) revert NotFoboToken();
        if (key.currency0 != address(0)) revert NotEthQuote(); // keyFor(address(0), ·) always is; kept explicit
        if (block.timestamp < uint256(launchedAt) + minAge) revert TooYoung();
        (, uint160 sqrtPriceX96, uint256 circulating) = hook.floorOf(key);
        floorQuote = floorBacking(sqrtPriceX96, circulating);
        if (floorQuote < minFloorQuote) revert FloorTooLow();
        if (IERC20Metadata(token).decimals() != 18) revert BadDecimals();
        (bool listed,,,,,) = IRegistryListedF(registry).getAsset(token);
        if (listed) revert AlreadyListed();
        cap = (IERC20Metadata(token).totalSupply() * capBps) / 10_000;
        if (cap == 0) revert Errors.AmountZero();
    }

    /// @notice Quote (ETH, wei) the floor pays for `circulating` tokens at the floor's worst-case price.
    /// v4 prices are currency1 per currency0 (token per ETH), so quote = circulating / price = circulating * 2^192 / sqrtP^2.
    function floorBacking(uint160 sqrtPriceX96, uint256 circulating) public pure returns (uint256) {
        if (sqrtPriceX96 == 0) return 0;
        return Math.mulDiv(Math.mulDiv(circulating, Q96, sqrtPriceX96), Q96, sqrtPriceX96);
    }

    /// @dev `pools(id)`: a raw staticcall and a prefix decode, so the 15-field getter never meets the stack limit.
    function _pool(bytes32 id) internal view returns (address token, uint40 launchedAt) {
        (bool ok, bytes memory ret) = address(hook).staticcall(abi.encodeWithSelector(IFoboHook.pools.selector, id));
        if (!ok || ret.length < 96) revert NotFoboToken();
        (token,, launchedAt) = abi.decode(ret, (address, address, uint40));
    }

    function _calldata(address token, uint256 cap, uint256 minStrike_, bool puts) internal pure returns (bytes memory) {
        address[] memory tokens = new address[](1);
        uint256[] memory caps = new uint256[](1);
        uint256[] memory strikes = new uint256[](1);
        tokens[0] = token;
        caps[0] = cap;
        strikes[0] = minStrike_;
        return abi.encodeWithSignature("addAssets(address[],uint256[],uint256[],bool)", tokens, caps, strikes, puts);
    }

    // ---------------------------------------------------------------- admin (timelock)

    /// @notice Forgets a scheduled listing that can never execute (the timelock cancelled it, or the registry is
    /// full), so `list` can be called again later. Does not touch the timelock itself.
    function reset(address token) external onlyTimelock {
        delete operationOf[token];
        delete saltOf[token];
        delete capOf[token];
        delete minStrikeOf[token];
        delete putsOf[token];
    }

    function setCapBps(uint256 capBps_) external onlyTimelock {
        if (capBps_ == 0 || capBps_ > 10_000) revert BadBps();
        emit CapBpsChanged(capBps, capBps_);
        capBps = capBps_;
    }

    function setMinStrike(uint256 minStrike_) external onlyTimelock {
        emit MinStrikeChanged(minStrike, minStrike_);
        minStrike = minStrike_;
    }

    function setMinAge(uint256 minAge_) external onlyTimelock {
        emit MinAgeChanged(minAge, minAge_);
        minAge = minAge_;
    }

    function setMinFloorQuote(uint256 minFloorQuote_) external onlyTimelock {
        emit MinFloorQuoteChanged(minFloorQuote, minFloorQuote_);
        minFloorQuote = minFloorQuote_;
    }

    function setPutsOn(bool putsOn_) external onlyTimelock {
        emit PutsOnChanged(putsOn, putsOn_);
        putsOn = putsOn_;
    }
}
