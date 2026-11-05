// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {OptionNFT} from "../src/OptionNFT.sol";
import {BaseTest} from "./Base.t.sol";

contract ArtHarness is OptionNFT {
    function fmt(uint256 v, uint8 d) external pure returns (string memory) {
        return _fmt(v, d);
    }

    function date(uint256 ts) external pure returns (string memory) {
        return _date(ts);
    }
}

/// Human units in the Option NFT metadata and art.
contract OptionNftFormatTest is Test {
    ArtHarness h = new ArtHarness();

    function test_fmt() public view {
        assertEq(h.fmt(1e18, 18), "1");
        assertEq(h.fmt(0.15 ether, 18), "0.15");
        assertEq(h.fmt(0.001 ether, 18), "0.001");
        assertEq(h.fmt(100_000e18, 18), "100,000");
        assertEq(h.fmt(1_234_567.5e18, 18), "1,234,567.5");
        assertEq(h.fmt(123_456_789, 18), "<0.000001");
        assertEq(h.fmt(1_500_000, 6), "1.5");
        assertEq(h.fmt(1, 6), "0.000001");
        assertEq(h.fmt(42, 0), "42");
        assertEq(h.fmt(0, 18), "0");
        assertEq(h.fmt(999, 3), "0.999");
    }

    function test_date() public view {
        assertEq(h.date(0), "1970-01-01 00:00 UTC");
        assertEq(h.date(951_782_400), "2000-02-29 00:00 UTC"); // leap day
        assertEq(h.date(1_793_943_479), "2026-11-06 05:37 UTC");
        assertEq(h.date(4_107_542_399), "2100-02-28 23:59 UTC");
    }
}

contract OptionNftUriTest is BaseTest {
    function test_tokenURI_callAndPut() public {
        uint256 c = _filledCall();
        uint256 p = _filledPut();
        string memory cu = nft.tokenURI(c);
        string memory pu = nft.tokenURI(p);
        assertGt(bytes(cu).length, 1000);
        assertGt(bytes(pu).length, 1000);
        console2.log("CALL_URI", cu);
        console2.log("PUT_URI", pu);
    }
}
