// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentIdentity} from "../src/AgentIdentity.sol";
import {JobEscrow} from "../src/JobEscrow.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address verifier = vm.envAddress("EVALUATOR_ADDRESS"); // derive from EVALUATOR_PRIVATE_KEY
        address deployer = vm.addr(deployerPk);

        vm.startBroadcast(deployerPk);
        AgentIdentity identity = new AgentIdentity(deployer);
        JobEscrow escrow = new JobEscrow(deployer, identity, verifier);
        identity.setEscrow(address(escrow));
        vm.stopBroadcast();

        console.log("AgentIdentity:", address(identity));
        console.log("JobEscrow:", address(escrow));
    }
}