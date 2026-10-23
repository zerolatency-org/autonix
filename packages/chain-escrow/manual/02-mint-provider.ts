/** Mints a provider agent, owned by the "providerOwner" role. */
import { escrowClientFrom, loadState, makeClients, roles, saveState } from "./_shared";

async function main() {
  const state = loadState();
  const { publicClient, walletClient, chain } = await makeClients();
  const escrowClient = escrowClientFrom(publicClient, state);

  const tokenId = await escrowClient.mintAgent(
    walletClient,
    chain,
    roles.providerOwner,
    roles.providerOwner.address,
    "ipfs://a-specialist-agent",
  );
  saveState({ providerTokenId: tokenId.toString() });

  console.log("Minted provider agent, token id:", tokenId.toString());
  console.log("Owned by:", roles.providerOwner.address);
  console.log("\nVerify independently with cast:");
  console.log(
    `  cast call ${state.identityAddress} "ownerOf(uint256)(address)" ${tokenId} --rpc-url ${process.env.RPC_URL ?? "http://127.0.0.1:8545"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
