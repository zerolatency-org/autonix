/** The provider agent's owner accepts the job. */
import { escrowClientFrom, loadState, makeClients, roles } from "./_shared";

async function main() {
  const state = loadState();
  if (!state.jobId) throw new Error("No job yet — run manual/03-create-job.ts first.");
  const { publicClient, walletClient, chain } = await makeClients();
  const escrowClient = escrowClientFrom(publicClient, state);

  await escrowClient.accept(walletClient, chain, roles.providerOwner, BigInt(state.jobId));
  const job = await escrowClient.getJob(BigInt(state.jobId));

  console.log("Accepted. Job status is now:", job.status, "(2 = Accepted)");
  console.log("Deliver by (unix seconds):", job.deliverDeadline.toString());
  console.log("\nVerify independently with cast:");
  console.log(
    `  cast call ${state.escrowAddress} "jobs(uint256)" ${state.jobId} --rpc-url ${process.env.RPC_URL ?? "http://127.0.0.1:8545"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
