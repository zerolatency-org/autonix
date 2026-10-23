import { type LoopResult, runLoop, ToolRegistry } from "@autonix/loop";
import { FakeCompute } from "@autonix/ports";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobStatus } from "./client";
import { createHireAgentTool } from "./hire-agent-tool";
import { type AnvilContext, startAnvilWithContracts } from "./testing/anvil";

function plan(steps: unknown[]) {
  return JSON.stringify({ steps });
}

/** Pulls the one useful thing out of a finished sub-loop run: the last
 * successful step's output, which is what gets committed on-chain as the
 * delivery. Throws if the provider's own loop never actually finished. */
function extractDelivery(result: LoopResult): unknown {
  if (result.status !== "done") {
    throw new Error(`provider's own loop did not finish: ${result.status}`);
  }
  const last = [...result.stepResults].reverse().find((r) => r.ok);
  if (!last) throw new Error("provider's own loop produced no successful step");
  return last.output;
}

describe("agent hires agent, end to end against real Anvil", () => {
  let ctx: AnvilContext;
  let providerTokenId: bigint;

  beforeAll(async () => {
    ctx = await startAnvilWithContracts();
    const [, , providerPk] = ctx.privateKeys;
    providerTokenId = await ctx.escrowClient.mintAgent(
      ctx.walletClient,
      { id: ctx.chainId } as never,
      privateKeyToAccount(providerPk),
      ctx.accounts.providerOwner,
      "ipfs://specialist-doubler",
    );
  }, 30_000);

  afterAll(async () => {
    await ctx.stop();
  });

  it("hiring agent's loop hires the provider agent, which does real work, gets paid on a real settle", async () => {
    const [, buyerPk, providerPk, verifierPk] = ctx.privateKeys;
    const buyerAccount = privateKeyToAccount(buyerPk);
    const providerAccount = privateKeyToAccount(providerPk);
    const verifierAccount = privateKeyToAccount(verifierPk);
    const chain = { id: ctx.chainId } as never;

    // --- the PROVIDER's own loop: runs completely independently, its own
    // compute instance, its own tool — the hiring side knows nothing about this.
    const providerCompute = new FakeCompute(() => {
      const script = [
        plan([
          {
            id: "p1",
            description: "double the number",
            successCriteria: "result is 42",
            tool: "double",
            input: { n: 21 },
          },
        ]),
        JSON.stringify({ pass: true, score: 100, reason: "42 is correct" }),
      ];
      return script[providerCallCount++] ?? "";
    });
    let providerCallCount = 0;
    const providerTools = new ToolRegistry();
    providerTools.register("double", async (input) => ({ result: (input as { n: number }).n * 2 }));

    const runProviderWork = async (goal: string) => {
      const result = await runLoop(goal, {
        compute: providerCompute,
        tools: providerTools,
        availableToolNames: ["double"],
      });
      return extractDelivery(result);
    };

    const evaluate = async (delivery: unknown) => {
      const ok = (delivery as { result?: number }).result === 42;
      return {
        pass: ok,
        score: ok ? 100 : 0,
        reason: ok ? "matches expected result" : "result did not match",
      };
    };

    const hireAgentTool = createHireAgentTool({
      escrowClient: ctx.escrowClient,
      walletClient: ctx.walletClient,
      chain,
      chainId: ctx.chainId,
      escrowAddress: ctx.escrowAddress,
      buyerAccount,
      providerAccount,
      verifierAccount,
      runProviderWork,
      evaluate,
    });

    // --- the HIRING agent's own loop: all it knows is "hireAgent" is a tool.
    let hiringCallCount = 0;
    const hiringCompute = new FakeCompute(() => {
      const script = [
        plan([
          {
            id: "h1",
            description: "hire a specialist to double 21",
            successCriteria: "the hired job settles with a passing verdict",
            tool: "hireAgent",
            input: {
              providerTokenId: providerTokenId.toString(),
              goal: "double the number 21",
              criteriaText: "result must be 42",
              valueWei: "1000000000000000",
            },
          },
        ]),
        JSON.stringify({ pass: true, score: 100, reason: "the hire settled successfully" }),
      ];
      return script[hiringCallCount++] ?? "";
    });
    const hiringTools = new ToolRegistry();
    hiringTools.register("hireAgent", hireAgentTool);

    const result = await runLoop("get 21 doubled via a specialist agent", {
      compute: hiringCompute,
      tools: hiringTools,
      availableToolNames: ["hireAgent"],
    });

    expect(result.status).toBe("done");
    expect(result.stepResults[0]?.ok).toBe(true);
    const output = result.stepResults[0]?.output as {
      pass: boolean;
      delivery: unknown;
      jobId: string;
    };
    expect(output.pass).toBe(true);
    expect(output.delivery).toEqual({ result: 42 });

    // --- and the REAL, on-chain proof: the job actually settled and the
    // provider's owner actually got paid, verifiable independently of the loop.
    const job = await ctx.escrowClient.getJob(BigInt(output.jobId));
    expect(job.status).toBe(JobStatus.Settled);
    const providerBalance = await ctx.escrowClient.balanceOf(ctx.accounts.providerOwner);
    expect(providerBalance).toBe(1_000_000_000_000_000n);
  }, 30_000);

  it("a failing delivery results in a refund, and the hiring loop sees the tool call fail", async () => {
    const [, buyerPk, providerPk, verifierPk] = ctx.privateKeys;
    const buyerAccount = privateKeyToAccount(buyerPk);
    const providerAccount = privateKeyToAccount(providerPk);
    const verifierAccount = privateKeyToAccount(verifierPk);
    const chain = { id: ctx.chainId } as never;

    let providerCallCount = 0;
    const providerCompute = new FakeCompute(() => {
      const script = [
        plan([
          {
            id: "p1",
            description: "double the number",
            successCriteria: "result is 100",
            tool: "double",
            input: { n: 21 },
          },
        ]),
        JSON.stringify({ pass: true, score: 100, reason: "looks right" }),
      ];
      return script[providerCallCount++] ?? "";
    });
    const providerTools = new ToolRegistry();
    providerTools.register("double", async (input) => ({ result: (input as { n: number }).n * 2 })); // gives 42, buyer wanted 100

    const hireAgentTool = createHireAgentTool({
      escrowClient: ctx.escrowClient,
      walletClient: ctx.walletClient,
      chain,
      chainId: ctx.chainId,
      escrowAddress: ctx.escrowAddress,
      buyerAccount,
      providerAccount,
      verifierAccount,
      runProviderWork: async (goal) => {
        const result = await runLoop(goal, {
          compute: providerCompute,
          tools: providerTools,
          availableToolNames: ["double"],
        });
        return extractDelivery(result);
      },
      evaluate: async (delivery) => {
        const ok = (delivery as { result?: number }).result === 100;
        return { pass: ok, score: ok ? 100 : 0, reason: ok ? "matches" : "wrong result delivered" };
      },
    });

    let hiringCallCount = 0;
    const hiringCompute = new FakeCompute(() => {
      const script = [
        plan([
          {
            id: "h1",
            description: "hire a specialist",
            successCriteria: "settles passing",
            tool: "hireAgent",
            input: {
              providerTokenId: providerTokenId.toString(),
              goal: "multiply 21 by 5",
              criteriaText: "result must be 100",
              valueWei: "1000000000000000",
            },
          },
        ]),
      ];
      return script[hiringCallCount++] ?? plan([]); // replan returns empty -> loop stops via max_replans
    });
    const hiringTools = new ToolRegistry();
    hiringTools.register("hireAgent", hireAgentTool);

    const result = await runLoop("get 21 multiplied by 5 via a specialist agent", {
      compute: hiringCompute,
      tools: hiringTools,
      availableToolNames: ["hireAgent"],
      maxReplans: 0,
    });

    expect(result.status).toBe("max_replans_exceeded");
    expect(result.stepResults[0]?.ok).toBe(false);
    expect(result.stepResults[0]?.error).toMatch(/failed verification/);
  }, 30_000);
});