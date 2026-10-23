/**
 * Deploys AgentIdentity + JobEscrow onto whatever's running at RPC_URL
 * (default http://127.0.0.1:8545 — a plain `anvil` with no flags).
 * Run this ONCE per anvil session. Saves addresses to .state.json for every
 * later script to pick up.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Abi } from "viem";
import { makeClients, printRoles, roles, saveState } from "./_shared";

function readArtifact(name: string): { abi: Abi; bytecode: `0x${string}` } {
  const path = resolve(import.meta.dirname, `../../../contracts/out/${name}.sol/${name}.json`);
  const json = JSON.parse(readFileSync(path, "utf-8"));
  return { abi: json.abi, bytecode: json.bytecode.object };
}

async function main() {
  printRoles();
  const { publicClient, walletClient, chain } = await makeClients();

  const identityArtifact = readArtifact("AgentIdentity");
  const escrowArtifact = readArtifact("JobEscrow");

  console.log("\nDeploying AgentIdentity...");
  const identityHash = await walletClient.deployContract({
    abi: identityArtifact.abi,
    bytecode: identityArtifact.bytecode,
    args: [roles.deployer.address],
    account: roles.deployer,
    chain,
  });
  const identityReceipt = await publicClient.waitForTransactionReceipt({ hash: identityHash });
  if (!identityReceipt.contractAddress)
    throw new Error("AgentIdentity deployment produced no contract address");
  const identityAddress = identityReceipt.contractAddress;
  console.log("  AgentIdentity deployed at:", identityAddress);

  console.log("Deploying JobEscrow...");
  const escrowHash = await walletClient.deployContract({
    abi: escrowArtifact.abi,
    bytecode: escrowArtifact.bytecode,
    args: [roles.deployer.address, identityAddress, roles.verifier.address],
    account: roles.deployer,
    chain,
  });
  const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowHash });
  if (!escrowReceipt.contractAddress)
    throw new Error("JobEscrow deployment produced no contract address");
  const escrowAddress = escrowReceipt.contractAddress;
  console.log("  JobEscrow deployed at:", escrowAddress);

  console.log("Wiring identity.setEscrow(escrow)...");
  const setEscrowHash = await walletClient.writeContract({
    address: identityAddress,
    abi: identityArtifact.abi,
    functionName: "setEscrow",
    args: [escrowAddress],
    account: roles.deployer,
    chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: setEscrowHash });

  saveState({ identityAddress, escrowAddress });

  console.log("\nDone. Verify independently with cast:");
  console.log(
    `  cast call ${escrowAddress} "verifier()(address)" --rpc-url ${process.env.RPC_URL ?? "http://127.0.0.1:8545"}`,
  );
  console.log(`  (should print ${roles.verifier.address})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});