// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IOptionMarket} from "./interfaces/IOptionMarket.sol";
import {IOptionNFT} from "./interfaces/IOptionNFT.sol";
import {Constants} from "./lib/Constants.sol";
import {Errors} from "./lib/Errors.sol";
import {Position} from "./lib/Types.sol";

/// @notice One NFT per filled option (SPEC.md §5). Whoever holds it at exercise time gets the payout.
/// @dev Only the two markets mint and burn, each only within its own id tag. `_mint`, never `_safeMint`,
/// so a buyer contract can't reenter during `buy`. Markets are set once by the deployer and then locked.
contract OptionNFT is ERC721, IOptionNFT {
    using Strings for uint256;

    address public immutable deployer;
    address public callMarket;
    address public putMarket;

    constructor() ERC721("Option", "OPTION") {
        deployer = msg.sender;
    }

    function setMarkets(address callMarket_, address putMarket_) external {
        if (msg.sender != deployer) revert Errors.NotDeployer();
        if (callMarket != address(0)) revert Errors.MarketsAlreadySet();
        if (callMarket_ == address(0) || putMarket_ == address(0)) revert Errors.ZeroAddress();
        callMarket = callMarket_;
        putMarket = putMarket_;
    }

    function mint(address to, uint256 id) external {
        _onlyMarketFor(id);
        _mint(to, id);
    }

    function burn(uint256 id) external {
        _onlyMarketFor(id);
        _burn(id);
    }

    function ownerOf(uint256 id) public view override(ERC721, IOptionNFT) returns (address) {
        return super.ownerOf(id);
    }

    function marketOf(uint256 id) public view returns (address) {
        uint256 tag = id >> 248;
        if (tag == Constants.CALL_TAG) return callMarket;
        if (tag == Constants.PUT_TAG) return putMarket;
        return address(0);
    }

    /// @notice On-chain JSON + SVG with the option's terms.
    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        Position memory p = IOptionMarket(marketOf(id)).getPosition(id);
        bool isCall = (id >> 248) == Constants.CALL_TAG;
        string memory symbol = _symbolOf(p.token);
        string memory kind = isCall ? "CALL" : "PUT";
        string memory local = (id & ((uint256(1) << 248) - 1)).toString();

        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<rect width="400" height="400" rx="24" fill="#07090c"/>',
            '<text x="32" y="64" fill="',
            isCall ? "#7cf2c9" : "#ff9a7a",
            '" font-family="monospace" font-size="22">',
            kind,
            " #",
            local,
            "</text>",
            _line(130, "Underlying", string.concat(p.amount.toString(), " ", symbol, " (raw)")),
            _line(190, "Strike (wei WETH)", p.strike.toString()),
            _line(250, "Premium (wei WETH)", p.premium.toString()),
            _line(310, "Expiry (unix)", uint256(p.expiry).toString()),
            "</svg>"
        );

        string memory json = string.concat(
            '{"name":"',
            symbol,
            " ",
            kind,
            " #",
            local,
            '","description":"Physically settled option. Exercise before expiry.","attributes":[',
            '{"trait_type":"Type","value":"',
            kind,
            '"},{"trait_type":"Underlying","value":"',
            Strings.toHexString(p.token),
            '"},{"trait_type":"Amount","value":"',
            p.amount.toString(),
            '"},{"trait_type":"Strike","value":"',
            p.strike.toString(),
            '"},{"display_type":"date","trait_type":"Expiry","value":',
            uint256(p.expiry).toString(),
            '}],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _onlyMarketFor(uint256 id) internal view {
        address m = marketOf(id);
        if (m == address(0) || msg.sender != m) revert Errors.NotMarket();
    }

    function _line(uint256 y, string memory k, string memory v) internal pure returns (string memory) {
        return string.concat(
            '<text x="32" y="',
            y.toString(),
            '" fill="#8b98a8" font-family="monospace" font-size="13">',
            k,
            '</text><text x="32" y="',
            (y + 24).toString(),
            '" fill="#eef3f7" font-family="monospace" font-size="16">',
            v,
            "</text>"
        );
    }

    /// @dev Listed tokens only, but a weird `symbol()` must never break tokenURI.
    /// Only plain alphanumeric symbols are embedded, so a symbol can't inject JSON or SVG.
    function _symbolOf(address token) internal view returns (string memory) {
        try IERC20Metadata(token).symbol() returns (string memory s) {
            bytes memory b = bytes(s);
            if (b.length == 0 || b.length > 16) return "TOKEN";
            for (uint256 i; i < b.length; ++i) {
                bytes1 c = b[i];
                bool ok = (c >= "0" && c <= "9") || (c >= "A" && c <= "Z") || (c >= "a" && c <= "z");
                if (!ok) return "TOKEN";
            }
            return s;
        } catch {
            return "TOKEN";
        }
    }
}
