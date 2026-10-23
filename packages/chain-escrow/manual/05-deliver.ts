/**
 * The provider commits its delivery. In the real loop, this would be the
 * hired agent's actual output; here, YOU type the delivered text by hand so
 * you can manually test both a passing and a failing outcome in 06-settle.ts.
 *
 * Usage: pnpm exec tsx manual/05-deliver.ts "the task is done, here is banana"
 */
import { keccak256, stringToHex } from "viem";
import { escrowClientFrom, loadState, makeClients, roles, saveState } from "./_shared";

async function main() {
  const deliveredText = process.argv[2] ?? "the task is done";
  const state = loadState();
  if (!state.jobId) throw new Error("No job yet — run the earlier scripts first.");
  const { publicClient, walletClient, chain } = await makeClients();
  const escrowClient = escrowClientFrom(publicClient, state);

  const resultHash = keccak256(stringToHex(deliveredText));
  await escrowClient.commitDelivery(
    walletClient,
    chain,
    roles.providerOwner,
    BigInt(state.jobId),
    resultHash,
  );
  saveState({}); // no-op, keeps the pattern consistent

  console.log("Delivered:", JSON.stringify(deliveredText));
  console.log("Committed hash:", resultHash);
  console.log("\nRemember the job's criteria was:", JSON.stringify(state.criteriaText));
  console.log("You decide in 06-settle.ts whether this delivery actually satisfies it.");
  console.log("\nVerify independently with cast — status should be 3 (Delivered):");
  console.log(
    `  cast call ${state.escrowAddress} "jobs(uint256)" ${state.jobId} --rpc-url ${process.env.RPC_URL ?? "http://127.0.0.1:8545"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});