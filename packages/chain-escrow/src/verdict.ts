import type { Account, Address, Hex, WalletClient } from "viem";

/** Must match JobEscrow.sol exactly: EIP712("AutonixJobEscrow", "1"), and the
 * single-field-per-line typehash `Verdict(uint256 jobId,bool pass,uint8 score,uint256 nonce)`.
 * If either side drifts, signatures silently stop verifying — there is no partial match. */
const VERDICT_TYPES = {
  Verdict: [
    { name: "jobId", type: "uint256" },
    { name: "pass", type: "bool" },
    { name: "score", type: "uint8" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export interface VerdictInput {
  jobId: bigint;
  pass: boolean;
  score: number;
  nonce: bigint;
}

/** Signs a verdict as the `verifier` account JobEscrow was deployed with.
 * The resulting signature is what `settle()` checks on-chain. */
export async function signVerdict(
  wallet: WalletClient,
  account: Account,
  chainId: number,
  escrowAddress: Address,
  verdict: VerdictInput,
): Promise<Hex> {
  return wallet.signTypedData({
    account,
    domain: { name: "AutonixJobEscrow", version: "1", chainId, verifyingContract: escrowAddress },
    types: VERDICT_TYPES,
    primaryType: "Verdict",
    message: verdict,
  });
}