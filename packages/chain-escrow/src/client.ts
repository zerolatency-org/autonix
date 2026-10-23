import {
  type Account,
  type Address,
  type Chain,
  decodeEventLog,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { agentIdentityAbi, jobEscrowAbi } from "./abis";

export const JobStatus = {
  None: 0,
  Open: 1,
  Accepted: 2,
  Delivered: 3,
  Settled: 4,
  Refunded: 5,
} as const;
export type JobStatusValue = (typeof JobStatus)[keyof typeof JobStatus];

export interface Job {
  buyer: Address;
  providerTokenId: bigint;
  providerOwnerAtAccept: Address;
  criteriaHash: Hex;
  resultHash: Hex;
  amountWei: bigint;
  acceptDeadline: bigint;
  deliverDeadline: bigint;
  status: JobStatusValue;
}

/** Thin wrapper over the two contracts. Takes plain viem clients so it works
 * identically against a local Anvil node (this phase) and the real 0G testnet
 * (Phase 5) — nothing in this file changes between the two. */
export class EscrowClient {
  constructor(
    private readonly publicClient: PublicClient,
    private readonly identityAddress: Address,
    private readonly escrowAddress: Address,
  ) {}

  async mintAgent(
    wallet: WalletClient,
    chain: Chain,
    account: Account,
    to: Address,
    profileURI: string,
  ): Promise<bigint> {
    const hash = await wallet.writeContract({
      address: this.identityAddress,
      abi: agentIdentityAbi,
      functionName: "mint",
      args: [to, profileURI],
      account,
      chain,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: agentIdentityAbi, ...log });
        if (decoded.eventName === "AgentMinted") {
          return (decoded.args as { tokenId: bigint }).tokenId;
        }
      } catch {
        // not this event, keep scanning
      }
    }
    throw new Error("mintAgent: AgentMinted event not found in receipt logs");
  }

  async createJob(
    wallet: WalletClient,
    chain: Chain,
    account: Account,
    args: { providerTokenId: bigint; criteriaHash: Hex; acceptDeadline: bigint; valueWei: bigint },
  ): Promise<{ jobId: bigint; txHash: Hash }> {
    const hash = await wallet.writeContract({
      address: this.escrowAddress,
      abi: jobEscrowAbi,
      functionName: "createJob",
      args: [args.providerTokenId, args.criteriaHash, args.acceptDeadline],
      value: args.valueWei,
      account,
      chain,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: jobEscrowAbi, ...log });
        if (decoded.eventName === "JobCreated") {
          return { jobId: (decoded.args as { jobId: bigint }).jobId, txHash: hash };
        }
      } catch {
        // not this event
      }
    }
    throw new Error("createJob: JobCreated event not found in receipt logs");
  }

  async accept(wallet: WalletClient, chain: Chain, account: Account, jobId: bigint): Promise<Hash> {
    const hash = await wallet.writeContract({
      address: this.escrowAddress,
      abi: jobEscrowAbi,
      functionName: "accept",
      args: [jobId],
      account,
      chain,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async commitDelivery(
    wallet: WalletClient,
    chain: Chain,
    account: Account,
    jobId: bigint,
    resultHash: Hex,
  ): Promise<Hash> {
    const hash = await wallet.writeContract({
      address: this.escrowAddress,
      abi: jobEscrowAbi,
      functionName: "commitDelivery",
      args: [jobId, resultHash],
      account,
      chain,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /** Anyone can relay a signed verdict — the trust is in the signature, so this
   * deliberately does not require any particular caller account. */
  async settle(
    wallet: WalletClient,
    chain: Chain,
    account: Account,
    args: { jobId: bigint; pass: boolean; score: number; nonce: bigint; signature: Hex },
  ): Promise<Hash> {
    const hash = await wallet.writeContract({
      address: this.escrowAddress,
      abi: jobEscrowAbi,
      functionName: "settle",
      args: [args.jobId, args.pass, args.score, args.nonce, args.signature],
      account,
      chain,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async withdraw(wallet: WalletClient, chain: Chain, account: Account): Promise<Hash> {
    const hash = await wallet.writeContract({
      address: this.escrowAddress,
      abi: jobEscrowAbi,
      functionName: "withdraw",
      args: [],
      account,
      chain,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async balanceOf(who: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.escrowAddress,
      abi: jobEscrowAbi,
      functionName: "balances",
      args: [who],
    });
  }

  async getJob(jobId: bigint): Promise<Job> {
    const [
      buyer,
      providerTokenId,
      providerOwnerAtAccept,
      criteriaHash,
      resultHash,
      amountWei,
      acceptDeadline,
      deliverDeadline,
      status,
    ] = await this.publicClient.readContract({
      address: this.escrowAddress,
      abi: jobEscrowAbi,
      functionName: "jobs",
      args: [jobId],
    });
    return {
      buyer,
      providerTokenId,
      providerOwnerAtAccept,
      criteriaHash,
      resultHash,
      amountWei,
      acceptDeadline,
      deliverDeadline,
      status: status as JobStatusValue,
    };
  }

  async ownerOfAgent(tokenId: bigint): Promise<Address> {
    return this.publicClient.readContract({
      address: this.identityAddress,
      abi: agentIdentityAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });
  }
}