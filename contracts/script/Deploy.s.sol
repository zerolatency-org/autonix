// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentIdentity} from "../src/AgentIdentity.sol";
import {JobEscrow} from "../src/JobEscrow.sol";

contract Deploy is Script {
  function run() external {
    uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
    // EVALUATOR_ADDRESS is the address that will sign verdicts (verifier role).
    // Derive it from EVALUATOR_PRIVATE_KEY with:  cast wallet address $EVALUATOR_PRIVATE_KEY
    address verifier = vm.envAddress("EVALUATOR_ADDRESS");
    address deployer = vm.addr(deployerPk);

    vm.startBroadcast(deployerPk);
    AgentIdentity identity = new AgentIdentity(deployer);
    JobEscrow escrow = new JobEscrow(deployer, identity, verifier);
    identity.setEscrow(address(escrow));
    vm.stopBroadcast();

    console.log("=== Autonix Deployment ===");
    console.log("Network  :", block.chainid);
    console.log("Deployer :", deployer);
    console.log("Verifier :", verifier);
    console.log("");
    console.log("AgentIdentity:", address(identity));
    console.log("JobEscrow    :", address(escrow));
    console.log("");
    console.log("Verify on explorer:");
    console.log(
      "  https://chainscan-galileo.0g.ai/address/",
      address(identity)
    );
    console.log("  https://chainscan-galileo.0g.ai/address/", address(escrow));

    // Write addresses to a JSON file for other packages to consume.
    // The file is committed to the repo (no secrets, just addresses).
    string memory json = string.concat(
      "{\n",
      '  "chainId": ',
      vm.toString(block.chainid),
      ",\n",
      '  "agentIdentity": "',
      vm.toString(address(identity)),
      '",\n',
      '  "jobEscrow": "',
      vm.toString(address(escrow)),
      '",\n',
      '  "verifier": "',
      vm.toString(verifier),
      '",\n',
      '  "deployer": "',
      vm.toString(deployer),
      '"\n',
      "}"
    );
    vm.writeFile("deployments/galileo.json", json);
    console.log("");
    console.log("Addresses saved to contracts/deployments/galileo.json");
  }
}
