import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Address, type Chain, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EscrowClient } from "../src/client";
import { ANVIL_PRIVATE_KEYS } from "../src/testing/anvil";

const STATE_PATH = resolve(import.meta.dirname, ".state.json");

export interface ManualState {
  identityAddress?: Address;
  escrowAddress?: Address;
  providerTokenId?: string;
  jobId?: string;
  criteriaText?: string;
}

export function loadState(): ManualState {
  if (!existsSync(STATE_PATH)) return {};
  return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
}

export function saveState(patch: Partial<ManualState>): ManualState {
  const next = { ...loadState(), ...patch };
  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
  return next;
}

export const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";

export const roles = {
  deployer: privateKeyToAccount(ANVIL_PRIVATE_KEYS[0]),
  buyer: privateKeyToAccount(ANVIL_PRIVATE_KEYS[1]),
  providerOwner: privateKeyToAccount(ANVIL_PRIVATE_KEYS[2]),
  verifier: privateKeyToAccount(ANVIL_PRIVATE_KEYS[3]),
};

export async function makeClients() {
  const publicClient = createPublicClient({ transport: http(RPC_URL) });
  const chainId = await publicClient.getChainId();
  const chain = { id: chainId } as unknown as Chain;
  const walletClient = createWalletClient({ chain, transport: http(RPC_URL) });
  return { publicClient, walletClient, chain, chainId };
}

export function escrowClientFrom(
  publicClient: Awaited<ReturnType<typeof makeClients>>["publicClient"],
  state: ManualState,
) {
  if (!state.identityAddress || !state.escrowAddress) {
    throw new Error("No contracts deployed yet — run manual/01-deploy.ts first.");
  }
  return new EscrowClient(publicClient, state.identityAddress, state.escrowAddress);
}

export function printRoles(): void {
  console.log("Roles (Anvil's well-known default test accounts):");
  console.log("  deployer :", roles.deployer.address);
  console.log("  buyer    :", roles.buyer.address);
  console.log("  provider :", roles.providerOwner.address);
  console.log("  verifier :", roles.verifier.address, "(the JobEscrow's signing authority)");
}
