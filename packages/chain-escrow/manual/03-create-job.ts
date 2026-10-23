/**
 * Buyer hires the provider agent. The "criteria" text is what the work will
 * actually be judged against later, in 06-settle.ts — set it to something you
 * can honestly evaluate by eye (this is the MANUAL version; no judge model).
 *
 * Usage: pnpm exec tsx manual/03-create-job.ts "the answer must be the word banana" 0.01
 */
import { keccak256, parseEther, stringToHex } from "viem";
import { escrowClientFrom, loadState, makeClients, roles, saveState } from "./_shared";

async function main() {
  const criteriaText = process.argv[2] ?? "the delivered text must contain the word 'done'";
  const ethAmount = process.argv[3] ?? "0.01";

  const state = loadState();
  const { publicClient, walletClient, chain } = await makeClients();
  const escrowClient = escrowClientFrom(publicClient, state);
  if (!state.providerTokenId)
    throw new Error("No provider minted yet — run manual/02-mint-provider.ts first.");

  const criteriaHash = keccak256(stringToHex(criteriaText));
  const { jobId } = await escrowClient.createJob(walletClient, chain, roles.buyer, {
    providerTokenId: BigInt(state.providerTokenId),
    criteriaHash,
    acceptDeadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    valueWei: parseEther(ethAmount),
  });
  saveState({ jobId: jobId.toString(), criteriaText });

  console.log("Job created, id:", jobId.toString());
  console.log("Criteria (remember this for 06-settle.ts):", criteriaText);
  console.log("Amount locked:", ethAmount, "ETH");
  console.log("\nVerify independently with cast — status should be 1 (Open):");
  console.log(
    `  cast call ${state.escrowAddress} "jobs(uint256)" ${jobId} --rpc-url ${process.env.RPC_URL ?? "http://127.0.0.1:8545"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});