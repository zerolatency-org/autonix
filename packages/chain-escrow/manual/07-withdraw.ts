/** Provider actually pulls the money out. Watch their real ETH balance change. */
import { formatEther } from "viem";
import { escrowClientFrom, loadState, makeClients, roles } from "./_shared";

async function main() {
  const state = loadState();
  const { publicClient, walletClient, chain } = await makeClients();
  const escrowClient = escrowClientFrom(publicClient, state);

  const before = await publicClient.getBalance({ address: roles.providerOwner.address });
  console.log("Provider's wallet balance before withdraw:", formatEther(before), "ETH");

  const withdrawable = await escrowClient.balanceOf(roles.providerOwner.address);
  if (withdrawable === 0n) {
    console.log(
      "\nNothing to withdraw — either the job failed verification, or this was already withdrawn.",
    );
    return;
  }

  await escrowClient.withdraw(walletClient, chain, roles.providerOwner);

  const after = await publicClient.getBalance({ address: roles.providerOwner.address });
  console.log("Provider's wallet balance after withdraw: ", formatEther(after), "ETH");
  console.log(
    "Escrow's withdrawable balance for them is now:",
    await escrowClient.balanceOf(roles.providerOwner.address),
  );
  console.log("\nVerify independently with cast:");
  console.log(
    `  cast balance ${roles.providerOwner.address} --rpc-url ${process.env.RPC_URL ?? "http://127.0.0.1:8545"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});