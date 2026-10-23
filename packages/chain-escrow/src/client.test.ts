import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobStatus } from "./client";
import { type AnvilContext, startAnvilWithContracts } from "./testing/anvil";
import { signVerdict } from "./verdict";

describe("EscrowClient against a real local Anvil node", () => {
  let ctx: AnvilContext;
  let providerTokenId: bigint;

  beforeAll(async () => {
    ctx = await startAnvilWithContracts();
    const [, , providerPk] = ctx.privateKeys;
    const providerAccount = privateKeyToAccount(providerPk);
    const liveChain = { id: ctx.chainId } as never;
    providerTokenId = await ctx.escrowClient.mintAgent(
      ctx.walletClient,
      liveChain,
      providerAccount,
      ctx.accounts.providerOwner,
      "ipfs://provider",
    );
  }, 30_000);

  afterAll(async () => {
    await ctx.stop();
  });

  function accountsFor() {
    const [, buyerPk, providerPk, verifierPk] = ctx.privateKeys;
    return {
      buyer: privateKeyToAccount(buyerPk),
      provider: privateKeyToAccount(providerPk),
      verifier: privateKeyToAccount(verifierPk),
      chain: { id: ctx.chainId } as never,
    };
  }

  it("mints a real agent identity on-chain with the right owner", async () => {
    const owner = await ctx.escrowClient.ownerOfAgent(providerTokenId);
    expect(owner.toLowerCase()).toBe(ctx.accounts.providerOwner.toLowerCase());
  });

  it("runs the full happy path: create, accept, deliver, settle, withdraw", async () => {
    const { buyer, provider, verifier, chain } = accountsFor();
    const criteriaHash = `0x${"11".repeat(32)}` as const;

    const { jobId } = await ctx.escrowClient.createJob(ctx.walletClient, chain, buyer, {
      providerTokenId,
      criteriaHash,
      acceptDeadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      valueWei: 1_000_000_000_000_000_000n, // 1 ETH-equivalent, Anvil's native unit
    });

    await ctx.escrowClient.accept(ctx.walletClient, chain, provider, jobId);
    let job = await ctx.escrowClient.getJob(jobId);
    expect(job.status).toBe(JobStatus.Accepted);
    expect(job.providerOwnerAtAccept.toLowerCase()).toBe(ctx.accounts.providerOwner.toLowerCase());

    const resultHash = `0x${"22".repeat(32)}` as const;
    await ctx.escrowClient.commitDelivery(ctx.walletClient, chain, provider, jobId, resultHash);
    job = await ctx.escrowClient.getJob(jobId);
    expect(job.status).toBe(JobStatus.Delivered);

    const nonce = BigInt(Date.now()); // unique per test run
    const signature = await signVerdict(
      ctx.walletClient,
      verifier,
      ctx.chainId,
      ctx.escrowAddress,
      {
        jobId,
        pass: true,
        score: 95,
        nonce,
      },
    );

    await ctx.escrowClient.settle(ctx.walletClient, chain, buyer, {
      jobId,
      pass: true,
      score: 95,
      nonce,
      signature,
    });
    job = await ctx.escrowClient.getJob(jobId);
    expect(job.status).toBe(JobStatus.Settled);

    const balance = await ctx.escrowClient.balanceOf(ctx.accounts.providerOwner);
    expect(balance).toBe(1_000_000_000_000_000_000n);

    await ctx.escrowClient.withdraw(ctx.walletClient, chain, provider);
    const balanceAfter = await ctx.escrowClient.balanceOf(ctx.accounts.providerOwner);
    expect(balanceAfter).toBe(0n);
  }, 30_000);

  it("a failing verdict refunds the buyer instead of paying the provider", async () => {
    const { buyer, provider, verifier, chain } = accountsFor();
    const criteriaHash = `0x${"33".repeat(32)}` as const;

    const { jobId } = await ctx.escrowClient.createJob(ctx.walletClient, chain, buyer, {
      providerTokenId,
      criteriaHash,
      acceptDeadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      valueWei: 500_000_000_000_000_000n,
    });
    await ctx.escrowClient.accept(ctx.walletClient, chain, provider, jobId);
    await ctx.escrowClient.commitDelivery(
      ctx.walletClient,
      chain,
      provider,
      jobId,
      `0x${"44".repeat(32)}`,
    );

    const nonce = BigInt(Date.now() + 1);
    const signature = await signVerdict(
      ctx.walletClient,
      verifier,
      ctx.chainId,
      ctx.escrowAddress,
      {
        jobId,
        pass: false,
        score: 10,
        nonce,
      },
    );
    await ctx.escrowClient.settle(ctx.walletClient, chain, buyer, {
      jobId,
      pass: false,
      score: 10,
      nonce,
      signature,
    });

    const job = await ctx.escrowClient.getJob(jobId);
    expect(job.status).toBe(JobStatus.Refunded);

    const buyerBalance = await ctx.escrowClient.balanceOf(ctx.accounts.buyer);
    expect(buyerBalance).toBe(500_000_000_000_000_000n);
  }, 30_000);

  it("a signature from the wrong signer is rejected by the real contract", async () => {
    const { buyer, provider, chain } = accountsFor();
    const impostor = privateKeyToAccount(ctx.privateKeys[0]); // deployer, not the verifier
    const criteriaHash = `0x${"55".repeat(32)}` as const;

    const { jobId } = await ctx.escrowClient.createJob(ctx.walletClient, chain, buyer, {
      providerTokenId,
      criteriaHash,
      acceptDeadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      valueWei: 100_000_000_000_000_000n,
    });
    await ctx.escrowClient.accept(ctx.walletClient, chain, provider, jobId);
    await ctx.escrowClient.commitDelivery(
      ctx.walletClient,
      chain,
      provider,
      jobId,
      `0x${"66".repeat(32)}`,
    );

    const nonce = BigInt(Date.now() + 2);
    const badSignature = await signVerdict(
      ctx.walletClient,
      impostor,
      ctx.chainId,
      ctx.escrowAddress,
      {
        jobId,
        pass: true,
        score: 100,
        nonce,
      },
    );

    await expect(
      ctx.escrowClient.settle(ctx.walletClient, chain, buyer, {
        jobId,
        pass: true,
        score: 100,
        nonce,
        signature: badSignature,
      }),
    ).rejects.toThrow();
  }, 30_000);
});
