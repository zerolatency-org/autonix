// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Phase 0 toolchain check.
/// Proves that compiling, OpenZeppelin imports, events, access control and tests all work.
/// It is deleted or replaced once the real contracts arrive in Phase 1.
contract Hello is Ownable {
    string private _greeting;

    event GreetingChanged(address indexed by, string newGreeting);

    constructor(address initialOwner, string memory initialGreeting) Ownable(initialOwner) {
        _greeting = initialGreeting;
    }

    function greeting() external view returns (string memory) {
        return _greeting;
    }

    function setGreeting(string calldata newGreeting) external onlyOwner {
        _greeting = newGreeting;
        emit GreetingChanged(msg.sender, newGreeting);
    }
}