// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Errors} from "./lib/Errors.sol";
import {Governed} from "./lib/Governed.sol";

/// @title UsdgRewards
/// @notice USDG trading rewards for Kyte, one Merkle root per 24 h epoch (the protocol epoch, `block.timestamp / 1 days`).
/// The indexer scores every epoch from fees actually paid (docs/USDG_REWARDS.md), builds the tree, and the keeper
/// (`publisher`) publishes the root once the epoch is final. Anyone then claims for any account; the USDG always goes
/// to the account in the leaf.
///
/// Rules, in the protocol's shape (SPEC.md §2): the timelock funds, sets the publisher, treasury and claim window, and
/// can withdraw only what is not owed; the guardian can pause publishing and revoke an unclaimed root, never claims.
/// Unclaimed USDG never parks in the contract: when an epoch expires, `sweep` returns it to the treasury.
/// Claims are exits: they cannot be paused, and the contract never owes more than it holds (a root publishes only if
/// the unowed balance covers its total). Leaves use OpenZeppelin's StandardMerkleTree encoding (double keccak,
/// sorted pairs): `keccak256(bytes.concat(keccak256(abi.encode(epoch, account, amount))))`.
contract UsdgRewards is Governed {
    using SafeERC20 for IERC20;

    struct Epoch {
        bytes32 root;
        uint128 total;
        uint128 claimed;
        uint64 publishedAt;
        uint64 expiresAt;
        bool swept;
    }

    IERC20 public immutable token;
    /// @notice The keeper key that publishes roots. Timelock-set.
    address public publisher;
    /// @notice How long an epoch's claims stay open after publication. Timelock-set, 1 to 365 days.
    uint64 public claimWindow;
    /// @notice Where unclaimed USDG goes when an expired epoch is swept (the ops Safe). Timelock-set.
    address public treasury;

    mapping(uint256 epoch => Epoch) public epochs;
    mapping(uint256 epoch => mapping(address account => bool)) public isClaimed;
    /// @notice USDG owed to claimants: published totals minus claims minus swept leftovers.
    uint256 public outstanding;

    event RootPublished(uint256 indexed epoch, bytes32 root, uint256 total, uint64 expiresAt);
    event RootRevoked(uint256 indexed epoch, bytes32 root);
    event Claimed(uint256 indexed epoch, address indexed account, uint256 amount);
    event EpochSwept(uint256 indexed epoch, uint256 unclaimed, address indexed to);
    event Withdrawn(address indexed to, uint256 amount);
    event PublisherChanged(address indexed oldValue, address indexed newValue);
    event ClaimWindowChanged(uint64 oldValue, uint64 newValue);
    event TreasuryChanged(address indexed oldValue, address indexed newValue);

    error NotPublisher();
    error InvalidRoot();
    error EpochExists(uint256 epoch);
    error UnknownEpoch(uint256 epoch);
    error EpochNotFinal(uint256 epoch);
    error InsufficientFunding(uint256 needed, uint256 available);
    error EpochExpired(uint256 epoch);
    error EpochNotExpired(uint256 epoch);
    error AlreadyClaimed(uint256 epoch, address account);
    error InvalidProof();
    error ClaimsStarted(uint256 epoch);
    error OverClaim();
    error BadWindow();

    constructor(
        address timelock_,
        address guardian_,
        address token_,
        address publisher_,
        address treasury_,
        uint64 claimWindow_
    ) Governed(timelock_, guardian_) {
        if (token_ == address(0) || publisher_ == address(0) || treasury_ == address(0)) {
            revert Errors.ZeroAddress();
        }
        if (claimWindow_ < 1 days || claimWindow_ > 365 days) revert BadWindow();
        token = IERC20(token_);
        publisher = publisher_;
        treasury = treasury_;
        claimWindow = claimWindow_;
    }

    modifier onlyPublisher() {
        if (msg.sender != publisher) revert NotPublisher();
        _;
    }

    /// @notice USDG in the contract that is not owed to anyone yet: the room for new epochs.
    function available() public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        return bal > outstanding ? bal - outstanding : 0;
    }

    /// @notice The protocol epoch now (`block.timestamp / 1 days`, as FeeVault counts).
    function currentEpoch() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    // --------------------------------------------------------------- publish

    /// @notice Publishes an epoch's root. Only a finished epoch, once, and only if the unowed balance covers `total`.
    function publish(uint256 epoch, bytes32 root, uint256 total) external onlyPublisher whenNotPaused {
        if (root == bytes32(0) || total == 0 || total > type(uint128).max) revert InvalidRoot();
        if (epoch >= currentEpoch()) revert EpochNotFinal(epoch);
        if (epochs[epoch].root != bytes32(0)) revert EpochExists(epoch);
        uint256 room = available();
        if (total > room) revert InsufficientFunding(total, room);
        uint64 expiresAt = uint64(block.timestamp) + claimWindow;
        epochs[epoch] = Epoch(root, uint128(total), 0, uint64(block.timestamp), expiresAt, false);
        outstanding += total;
        emit RootPublished(epoch, root, total, expiresAt);
    }

    /// @notice Undoes a wrong root while nobody has claimed from it; it can then be published again.
    function revoke(uint256 epoch) external onlyGuardianOrTimelock {
        Epoch memory e = epochs[epoch];
        if (e.root == bytes32(0) || e.swept) revert UnknownEpoch(epoch);
        if (e.claimed != 0) revert ClaimsStarted(epoch);
        outstanding -= e.total;
        delete epochs[epoch];
        emit RootRevoked(epoch, e.root);
    }

    // ----------------------------------------------------------------- claim

    /// @notice Claims an epoch's reward for `account`. Anyone may submit; the USDG always goes to `account`.
    /// Never pausable.
    function claim(uint256 epoch, address account, uint256 amount, bytes32[] calldata proof) public {
        Epoch storage e = epochs[epoch];
        if (e.root == bytes32(0)) revert UnknownEpoch(epoch);
        if (e.swept || block.timestamp > e.expiresAt) revert EpochExpired(epoch);
        if (isClaimed[epoch][account]) revert AlreadyClaimed(epoch, account);
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(epoch, account, amount))));
        if (!MerkleProof.verifyCalldata(proof, e.root, leaf)) revert InvalidProof();
        if (uint256(e.claimed) + amount > e.total) revert OverClaim();
        isClaimed[epoch][account] = true;
        e.claimed += uint128(amount);
        outstanding -= amount;
        token.safeTransfer(account, amount);
        emit Claimed(epoch, account, amount);
    }

    /// @notice Claims several epochs for one account in one transaction.
    function claimMany(
        uint256[] calldata epochList,
        address account,
        uint256[] calldata amounts,
        bytes32[][] calldata proofs
    ) external {
        if (epochList.length != amounts.length || epochList.length != proofs.length) {
            revert Errors.LengthMismatch();
        }
        for (uint256 i; i < epochList.length; ++i) {
            claim(epochList[i], account, amounts[i], proofs[i]);
        }
    }

    // ---------------------------------------------------------------- expiry

    /// @notice After the claim window, sends the unclaimed part straight back to the treasury (the ops Safe).
    /// Anyone may call; the keeper does it on its next tick. Nothing unclaimed stays parked in the contract.
    function sweep(uint256 epoch) external {
        Epoch storage e = epochs[epoch];
        if (e.root == bytes32(0) || e.swept) revert UnknownEpoch(epoch);
        if (block.timestamp <= e.expiresAt) revert EpochNotExpired(epoch);
        uint256 unclaimed = e.total - e.claimed;
        e.swept = true;
        outstanding -= unclaimed;
        if (unclaimed != 0) token.safeTransfer(treasury, unclaimed);
        emit EpochSwept(epoch, unclaimed, treasury);
    }

    // ----------------------------------------------------------------- admin

    /// @notice Moves budget out. Can never touch what is owed to claimants.
    function withdraw(address to, uint256 amount) external onlyTimelock {
        if (to == address(0)) revert Errors.ZeroAddress();
        uint256 room = available();
        if (amount > room) revert InsufficientFunding(amount, room);
        token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    function setPublisher(address publisher_) external onlyTimelock {
        if (publisher_ == address(0)) revert Errors.ZeroAddress();
        emit PublisherChanged(publisher, publisher_);
        publisher = publisher_;
    }

    function setClaimWindow(uint64 claimWindow_) external onlyTimelock {
        if (claimWindow_ < 1 days || claimWindow_ > 365 days) revert BadWindow();
        emit ClaimWindowChanged(claimWindow, claimWindow_);
        claimWindow = claimWindow_;
    }

    function setTreasury(address treasury_) external onlyTimelock {
        if (treasury_ == address(0)) revert Errors.ZeroAddress();
        emit TreasuryChanged(treasury, treasury_);
        treasury = treasury_;
    }
}
