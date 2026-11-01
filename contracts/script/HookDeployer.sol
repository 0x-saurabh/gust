// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

/// @notice CREATE2 factory used by the deploy scripts to put KyteHook at an address whose low 14 bits encode
/// its Uniswap v4 permissions (afterInitialize | afterSwap | afterSwapReturnDelta = 0x1044).
contract HookDeployer {
    uint160 public constant HOOK_FLAGS = (1 << 12) | (1 << 6) | (1 << 2);
    uint160 internal constant FLAG_MASK = 0x3FFF;

    event Deployed(address hook, bytes32 salt);

    function deploy(bytes32 salt, bytes memory initCode) external returns (address addr) {
        assembly {
            addr := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        require(addr != address(0), "create2 failed");
        emit Deployed(addr, salt);
    }

    function predict(bytes32 salt, bytes32 initCodeHash) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)))));
    }

    /// @dev Walks salts until the predicted address carries exactly the hook flags. ~16k tries on average.
    function mine(bytes32 initCodeHash, uint256 maxTries) public view returns (bytes32 salt, address hook) {
        for (uint256 i; i < maxTries; ++i) {
            salt = bytes32(i);
            hook = predict(salt, initCodeHash);
            if (uint160(hook) & FLAG_MASK == HOOK_FLAGS) return (salt, hook);
        }
        revert("no salt found");
    }
}
