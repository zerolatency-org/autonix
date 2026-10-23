/**
 * YOU play the evaluator: read the criteria and the delivered text printed by
 * 05-deliver.ts, decide pass or fail yourself, and this signs a real EIP-712
 * verdict as the `verifier` account and settles it on-chain.
 *
 * Usage:
 *   pnpm exec tsx manual/06-settle.ts pass 95
 *   pnpm exec tsx manual/06-settle.ts fail 20
 */

import { signVerdict } from "../src/verdict";
import { escrowClientFrom, loadState, makeClients, roles } from "./_shared";

async function main() {
  const verdictWord = process.argv[2];
  const score = Number(process.argv[3] ?? (verdictWord === "pass" ? 95 : 10));
  if (verdictWord !== "pass" && verdictWord !== "fail") {
    throw new Error(
      'First argument must be "pass" or "fail", e.g.: tsx manual/06-settle.ts pass 95',
    );
  }
  const pass = verdictWord === "pass";

  const state = loadState();
  if (!state.jobId || !state.escrowAddress)
    throw new Error("No job yet — run the earlier scripts first.");
  const { publicClient, walletClient, chain, chainId } = await makeClients();
  const escrowClient = escrowClientFrom(publicClient, state);

  const jobId = BigInt(state.jobId);
  const nonce = BigInt(Date.now());
  const signature = await signVerdict(walletClient, roles.verifier, chainId, state.escrowAddress, {
    jobId,
    pass,
    score,
    nonce,
  });
  console.log(
    "Signed verdict as verifier",
    roles.verifier.address,
    "-> pass:",
    pass,
    "score:",
    score,
  );

  // Anyone can relay the signed verdict — using the buyer here, but it could be anyone.
  await escrowClient.settle(walletClient, chain, roles.buyer, {
    jobId,
    pass,
    score,
    nonce,
    signature,
  });

  const job = await escrowClient.getJob(jobId);
  console.log("Settled. Job status:", job.status, pass ? "(4 = Settled)" : "(5 = Refunded)");

  const providerBalance = await escrowClient.balanceOf(roles.providerOwner.address);
  const buyerBalance = await escrowClient.balanceOf(roles.buyer.address);
  console.log("Provider's withdrawable balance:", providerBalance.toString(), "wei");
  console.log("Buyer's withdrawable balance (refund, if any):", buyerBalance.toString(), "wei");
  console.log("\nVerify independently with cast:");
  console.log(
    `  cast call ${state.escrowAddress} "balances(address)(uint256)" ${roles.providerOwner.address} --rpc-url ${process.env.RPC_URL ?? "http://127.0.0.1:8545"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});