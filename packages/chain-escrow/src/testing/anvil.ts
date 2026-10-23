import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Abi,
  type Address,
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EscrowClient } from "../client";

/** Anvil's well-known default test mnemonic accounts. Same every time by
 * design — these are NOT secrets, they're public test fixtures everyone uses. */
export const ANVIL_PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
] as const;

const chain = {
  id: 31337,
  name: "anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:0"] } }, // overwritten per-instance below
} as const;

function readArtifact(contractName: string): { abi: Abi; bytecode: `0x${string}` } {
  const path = resolve(
    import.meta.dirname,
    `../../../../contracts/out/${contractName}.sol/${contractName}.json`,
  );
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (cause) {
    // This bit me on a genuinely fresh clone: contracts/out is gitignored, so
    // it does not exist until Foundry has actually built the contracts.
    throw new Error(
      `could not read ${path} — have you run "pnpm contracts:build" (or "forge build" in contracts/) yet? ` +
        "This test reads the compiled ABI and bytecode directly from Foundry's output.",
      { cause },
    );
  }
  const json = JSON.parse(raw) as {
    abi: Abi;
    bytecode: { object: string };
  };
  return { abi: json.abi, bytecode: json.bytecode.object as `0x${string}` };
}

export interface AnvilContext {
  publicClient: PublicClient;
  walletClient: WalletClient;
  accounts: { deployer: Address; buyer: Address; providerOwner: Address; verifier: Address };
  privateKeys: typeof ANVIL_PRIVATE_KEYS;
  identityAddress: Address;
  escrowAddress: Address;
  escrowClient: EscrowClient;
  chainId: number;
  stop: () => Promise<void>;
}

async function waitForRpc(rpcUrl: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`anvil did not become ready at ${rpcUrl} within ${timeoutMs}ms`);
}

/** Spawns a real local Anvil node, deploys AgentIdentity + JobEscrow onto it
 * from the actual Foundry build artifacts, and wires them together exactly
 * like the Phase 1 deploy script does. Free, instant, no testnet involved. */
export async function startAnvilWithContracts(): Promise<AnvilContext> {
  const port = 20000 + Math.floor(Math.random() * 10000);
  const rpcUrl = `http://127.0.0.1:${port}`;

  // No --block-time flag: Anvil's default is to instantly mine a block per
  // transaction, which is exactly what tests want (no waiting, no polling).
  const anvilProcess: ChildProcess = spawn("anvil", ["--port", String(port), "--silent"], {
    stdio: "ignore",
  });

  await waitForRpc(rpcUrl);

  const [deployerPk, buyerPk, providerPk, verifierPk] = ANVIL_PRIVATE_KEYS;
  const deployer = privateKeyToAccount(deployerPk);
  const buyer = privateKeyToAccount(buyerPk);
  const providerOwner = privateKeyToAccount(providerPk);
  const verifier = privateKeyToAccount(verifierPk);

  const liveChain = { ...chain, rpcUrls: { default: { http: [rpcUrl] } } };
  const publicClient = createPublicClient({ chain: liveChain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ chain: liveChain, transport: http(rpcUrl) });

  const identityArtifact = readArtifact("AgentIdentity");
  const escrowArtifact = readArtifact("JobEscrow");

  const identityDeployHash = await walletClient.deployContract({
    abi: identityArtifact.abi,
    bytecode: identityArtifact.bytecode,
    args: [deployer.address],
    account: deployer,
    chain: liveChain,
  });
  const identityReceipt = await publicClient.waitForTransactionReceipt({
    hash: identityDeployHash,
  });
  const identityAddress = identityReceipt.contractAddress as Address;

  const escrowDeployHash = await walletClient.deployContract({
    abi: escrowArtifact.abi,
    bytecode: escrowArtifact.bytecode,
    args: [deployer.address, identityAddress, verifier.address],
    account: deployer,
    chain: liveChain,
  });
  const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowDeployHash });
  const escrowAddress = escrowReceipt.contractAddress as Address;

  const setEscrowHash = await walletClient.writeContract({
    address: identityAddress,
    abi: identityArtifact.abi,
    functionName: "setEscrow",
    args: [escrowAddress],
    account: deployer,
    chain: liveChain,
  });
  await publicClient.waitForTransactionReceipt({ hash: setEscrowHash });

  const escrowClient = new EscrowClient(publicClient, identityAddress, escrowAddress);
  const chainId = await publicClient.getChainId();

  return {
    publicClient,
    walletClient,
    accounts: {
      deployer: deployer.address,
      buyer: buyer.address,
      providerOwner: providerOwner.address,
      verifier: verifier.address,
    },
    privateKeys: ANVIL_PRIVATE_KEYS,
    identityAddress,
    escrowAddress,
    escrowClient,
    chainId,
    stop: async () => {
      anvilProcess.kill();
    },
  };
}