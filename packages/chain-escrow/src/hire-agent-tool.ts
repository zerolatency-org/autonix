import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  keccak256,
  stringToHex,
  type WalletClient,
} from "viem";
import type { EscrowClient } from "./client";
import { signVerdict } from "./verdict";

export interface HireAgentInput {
  providerTokenId: string; // bigint as a JSON-safe string — this is what the planner's JSON output will contain
  goal: string;
  criteriaText: string;
  valueWei: string;
}

export interface HireAgentResult {
  jobId: string;
  pass: boolean;
  score: number;
  verdictReason: string;
  delivery: unknown;
}

export interface HireAgentDeps {
  escrowClient: EscrowClient;
  walletClient: WalletClient;
  chain: Chain;
  chainId: number;
  escrowAddress: Address;
  buyerAccount: Account;
  providerAccount: Account; // simulates the hired agent's own process accepting + delivering
  verifierAccount: Account;
  acceptDeadlineSeconds?: number;
  /** Does the hired agent's actual work. In Phase 3's demo this runs the SAME
   * loop recursively against `goal` — but this file has no idea that's what
   * happens on the other side of this callback, by design. */
  runProviderWork: (goal: string) => Promise<unknown>;
  /** Decides pass/fail/score against criteriaText. A real evaluator service
   * (Phase 4+) would call a judge model here; tests can supply a fixed verdict. */
  evaluate: (
    delivery: unknown,
    criteriaText: string,
  ) => Promise<{ pass: boolean; score: number; reason: string }>;
}

/** The tool that makes "agent hires agent" real: opens an on-chain escrow job,
 * has the provider do the work, gets it evaluated, and settles — all through
 * the actual deployed contracts. Returns delivery data on a pass; THROWS on a
 * fail, so the loop's existing executeStep/verifyStep handle it with no
 * changes at all (a failed tool call is a failed tool call, hired or not). */
export function createHireAgentTool(deps: HireAgentDeps) {
  return async (rawInput: unknown): Promise<HireAgentResult> => {
    const input = rawInput as HireAgentInput;
    const providerTokenId = BigInt(input.providerTokenId);
    const criteriaHash = keccak256(stringToHex(input.criteriaText));
    const acceptDeadline = BigInt(
      Math.floor(Date.now() / 1000) + (deps.acceptDeadlineSeconds ?? 3600),
    );

    const { jobId } = await deps.escrowClient.createJob(
      deps.walletClient,
      deps.chain,
      deps.buyerAccount,
      {
        providerTokenId,
        criteriaHash,
        acceptDeadline,
        valueWei: BigInt(input.valueWei),
      },
    );

    await deps.escrowClient.accept(deps.walletClient, deps.chain, deps.providerAccount, jobId);

    const delivery = await deps.runProviderWork(input.goal);
    const resultHash = keccak256(stringToHex(JSON.stringify(delivery)));
    await deps.escrowClient.commitDelivery(
      deps.walletClient,
      deps.chain,
      deps.providerAccount,
      jobId,
      resultHash,
    );

    const verdict = await deps.evaluate(delivery, input.criteriaText);
    const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const signature: Hex = await signVerdict(
      deps.walletClient,
      deps.verifierAccount,
      deps.chainId,
      deps.escrowAddress,
      {
        jobId,
        pass: verdict.pass,
        score: verdict.score,
        nonce,
      },
    );

    await deps.escrowClient.settle(deps.walletClient, deps.chain, deps.buyerAccount, {
      jobId,
      pass: verdict.pass,
      score: verdict.score,
      nonce,
      signature,
    });

    if (!verdict.pass) {
      throw new Error(`hired agent's work failed verification: ${verdict.reason}`);
    }

    return {
      jobId: jobId.toString(),
      pass: true,
      score: verdict.score,
      verdictReason: verdict.reason,
      delivery,
    };
  };
}
