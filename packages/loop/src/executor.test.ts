import { describe, expect, it } from "vitest";
import { executeStep } from "./executor";
import { ToolRegistry } from "./tool-registry";
import type { Step } from "./types";

const step = (overrides: Partial<Step> = {}): Step => ({
  id: "s1",
  description: "do a thing",
  successCriteria: "the thing is done",
  tool: "doThing",
  input: { x: 1 },
  ...overrides,
});

describe("executeStep", () => {
  it("returns ok:true with the tool's output on success", async () => {
    const tools = new ToolRegistry();
    tools.register("doThing", async (input) => ({ received: input }));
    const result = await executeStep(step(), tools);
    expect(result).toEqual({ stepId: "s1", ok: true, output: { received: { x: 1 } } });
  });

  it("returns ok:false for an unknown tool, without throwing", async () => {
    const tools = new ToolRegistry();
    const result = await executeStep(step({ tool: "nope" }), tools);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown tool/);
  });

  it("catches a tool that throws and turns it into a failed result", async () => {
    const tools = new ToolRegistry();
    tools.register("doThing", async () => {
      throw new Error("boom");
    });
    const result = await executeStep(step(), tools);
    expect(result).toEqual({ stepId: "s1", ok: false, error: "boom" });
  });
});
