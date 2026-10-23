import { FakeCompute } from "@autonix/ports";
import { describe, expect, it } from "vitest";
import type { Step, StepResult } from "./types";
import { verifyStep } from "./verifier";

const step: Step = {
  id: "s1",
  description: "clean the csv",
  successCriteria: "no duplicate rows remain",
  tool: "cleanCsv",
  input: {},
};

describe("verifyStep", () => {
  it("fails immediately on a failed step, without calling the judge model", async () => {
    const compute = new FakeCompute(() => {
      throw new Error("the judge should never be called here");
    });
    const result: StepResult = { stepId: "s1", ok: false, error: "tool crashed" };
    const verdict = await verifyStep(compute, step, result);
    expect(verdict).toEqual({ pass: false, score: 0, reason: "tool crashed" });
  });

  it("fails on a deterministic check before calling the judge", async () => {
    const compute = new FakeCompute(() => {
      throw new Error("the judge should never be called here");
    });
    const result: StepResult = { stepId: "s1", ok: true, output: { rows: 2, duplicates: 1 } };
    const verdict = await verifyStep(compute, step, result, [
      (r) => {
        const out = r.output as { duplicates: number };
        return out.duplicates > 0 ? "duplicates still present" : null;
      },
    ]);
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toBe("duplicates still present");
  });

  it("passes a deterministic check and then asks the judge, which passes it", async () => {
    const compute = new FakeCompute(() =>
      JSON.stringify({ pass: true, score: 92, reason: "looks correct" }),
    );
    const result: StepResult = { stepId: "s1", ok: true, output: { rows: 2, duplicates: 0 } };
    const verdict = await verifyStep(compute, step, result, [
      (r) => ((r.output as { duplicates: number }).duplicates > 0 ? "dupes" : null),
    ]);
    expect(verdict).toEqual({ pass: true, score: 92, reason: "looks correct" });
  });

  it("fails when the judge votes fail", async () => {
    const compute = new FakeCompute(() =>
      JSON.stringify({ pass: false, score: 20, reason: "still off by one" }),
    );
    const result: StepResult = { stepId: "s1", ok: true, output: {} };
    const verdict = await verifyStep(compute, step, result);
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toBe("still off by one");
  });

  it("fails closed when the judge's reply cannot be parsed, rather than defaulting to pass", async () => {
    const compute = new FakeCompute(() => "I think it looks fine, no JSON here though");
    const result: StepResult = { stepId: "s1", ok: true, output: {} };
    const verdict = await verifyStep(compute, step, result);
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toMatch(/unparseable/);
  });
});
