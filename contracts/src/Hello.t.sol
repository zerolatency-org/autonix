// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Hello} from "../src/Hello.sol";

contract HelloTest is Test {
    Hello internal hello;
    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");

    event GreetingChanged(address indexed by, string newGreeting);

    function setUp() public {
        hello = new Hello(owner, "hello");
    }

    function test_InitialGreeting() public view {
        assertEq(hello.greeting(), "hello");
    }

    function test_OwnerIsSet() public view {
        assertEq(hello.owner(), owner);
    }

    function test_OwnerCanSetGreeting() public {
        vm.prank(owner);
        hello.setGreeting("gm");
        assertEq(hello.greeting(), "gm");
    }

    function test_SetGreetingEmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit GreetingChanged(owner, "gm");
        vm.prank(owner);
        hello.setGreeting("gm");
    }

    function test_StrangerCannotSetGreeting() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hello.setGreeting("nope");
    }

    function testFuzz_AnyStringRoundTrips(string calldata text) public {
        vm.prank(owner);
        hello.setGreeting(text);
        assertEq(hello.greeting(), text);
    }

    function testFuzz_AnyNonOwnerIsRejected(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        hello.setGreeting("x");
    }
}