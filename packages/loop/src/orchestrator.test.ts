import { FakeCompute } from "@autonix/ports";
import { describe, expect, it } from "vitest";
import { runLoop } from "./orchestrator";
import { ToolRegistry } from "./tool-registry";

function plan(steps: unknown[]) {
  return JSON.stringify({ steps });
}

describe("runLoop: happy path", () => {
  it("plans, executes, verifies, and finishes done when everything passes first try", async () => {
    const script = [
      plan([
        {
          id: "s1",
          description: "search",
          successCriteria: "found it",
          tool: "search",
          input: { q: "x" },
        },
      ]),
      JSON.stringify({ pass: true, score: 100, reason: "correct" }), // verifier judge call
    ];
    let call = 0;
    const compute = new FakeCompute(() => script[call++] ?? "");

    const tools = new ToolRegistry();
    tools.register("search", async () => ({ found: true }));

    const result = await runLoop("find x", { compute, tools, availableToolNames: ["search"] });

    expect(result.status).toBe("done");
    expect(result.replans).toBe(0);
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]?.ok).toBe(true);
    expect(result.verdicts[0]?.pass).toBe(true);
  });

  it("runs multiple steps in order", async () => {
    const script = [
      plan([
        { id: "s1", description: "a", successCriteria: "a done", tool: "noop", input: {} },
        { id: "s2", description: "b", successCriteria: "b done", tool: "noop", input: {} },
      ]),
      JSON.stringify({ pass: true, score: 100, reason: "ok" }),
      JSON.stringify({ pass: true, score: 100, reason: "ok" }),
    ];
    let call = 0;
    const compute = new FakeCompute(() => script[call++] ?? "");
    const tools = new ToolRegistry();
    const order: string[] = [];
    tools.register("noop", async () => {
      order.push("ran");
      return {};
    });

    const result = await runLoop("do a then b", { compute, tools, availableToolNames: ["noop"] });
    expect(result.status).toBe("done");
    expect(result.stepResults.map((r) => r.stepId)).toEqual(["s1", "s2"]);
    expect(order).toEqual(["ran", "ran"]);
  });
});

describe("runLoop: planning fails", () => {
  it("returns status planning_failed without touching any tools", async () => {
    const compute = new FakeCompute(() => "not json, sorry, and this stays not json");
    const tools = new ToolRegistry();
    const result = await runLoop("impossible goal", { compute, tools, availableToolNames: [] });
    expect(result.status).toBe("planning_failed");
    expect(result.stepResults).toHaveLength(0);
  });
});

describe("runLoop: adapt on failure", () => {
  it("re-plans after a failing verdict, then succeeds on the replanned step", async () => {
    const script = [
      // 1. initial plan: one step using the wrong search term
      plan([
        {
          id: "s1",
          description: "search for X",
          successCriteria: "found X",
          tool: "search",
          input: { q: "wrong" },
        },
      ]),
      // 2. verifier judges the (empty) result as a fail
      JSON.stringify({ pass: false, score: 10, reason: "no results for that query" }),
      // 3. replan returns a corrected step
      plan([
        {
          id: "s2",
          description: "search with the right term",
          successCriteria: "found X",
          tool: "search",
          input: { q: "right" },
        },
      ]),
      // 4. verifier judges the corrected result as a pass
      JSON.stringify({ pass: true, score: 95, reason: "found it this time" }),
    ];
    let call = 0;
    const compute = new FakeCompute(() => script[call++] ?? "");

    const tools = new ToolRegistry();
    tools.register("search", async (input) => {
      const q = (input as { q: string }).q;
      return q === "right" ? { found: true } : { found: false };
    });

    const result = await runLoop("find X", {
      compute,
      tools,
      availableToolNames: ["search"],
      maxReplans: 2,
    });

    expect(result.status).toBe("done");
    expect(result.replans).toBe(1);
    expect(result.stepResults).toHaveLength(2); // the failed attempt AND the successful one are both recorded
    expect(result.verdicts.map((v) => v.pass)).toEqual([false, true]);
    expect(result.events.some((e) => e.kind === "replanned")).toBe(true);
  });

  it("stops with max_replans_exceeded instead of looping forever", async () => {
    // every verdict fails, and every replan just returns another single failing step
    const failingStep = {
      id: "s1",
      description: "search",
      successCriteria: "found",
      tool: "search",
      input: {},
    };
    const compute = new FakeCompute((req) => {
      // Both the initial plan prompt and every replan prompt share the planner's
      // system-message shape, so that's what distinguishes a planning call from a judge call.
      const isPlanningCall =
        req.messages[0]?.role === "system" &&
        req.messages[0].content.includes("planning assistant");
      return isPlanningCall
        ? plan([failingStep])
        : JSON.stringify({ pass: false, score: 0, reason: "still wrong" });
    });

    const tools = new ToolRegistry();
    tools.register("search", async () => ({ found: false }));

    const result = await runLoop("find something impossible", {
      compute,
      tools,
      availableToolNames: ["search"],
      maxReplans: 2,
    });

    expect(result.status).toBe("max_replans_exceeded");
    expect(result.replans).toBe(2);
    // 1 initial attempt + 2 replanned attempts = 3 recorded results
    expect(result.stepResults).toHaveLength(3);
  });
});

describe("runLoop: deterministic checks run before the judge", () => {
  it("fails a step on a deterministic check without ever calling the judge for it", async () => {
    let judgeCalls = 0;
    const script = [
      plan([
        { id: "s1", description: "clean", successCriteria: "no dupes", tool: "clean", input: {} },
      ]),
    ];
    const compute = new FakeCompute((req) => {
      const isPlanningCall =
        req.messages[0]?.role === "system" &&
        req.messages[0].content.includes("planning assistant");
      if (isPlanningCall && script.length > 0) return script.shift() as string;
      if (isPlanningCall) return plan([]); // no more replans available in this test
      judgeCalls++;
      return JSON.stringify({ pass: true, score: 100, reason: "should not be reached" });
    });

    const tools = new ToolRegistry();
    tools.register("clean", async () => ({ duplicates: 3 }));

    const result = await runLoop("clean the data", {
      compute,
      tools,
      availableToolNames: ["clean"],
      maxReplans: 0,
      checksFor: (tool) =>
        tool === "clean"
          ? [(r) => ((r.output as { duplicates: number }).duplicates > 0 ? "dupes remain" : null)]
          : [],
    });

    expect(result.status).toBe("max_replans_exceeded");
    expect(result.verdicts[0]).toEqual({ pass: false, score: 0, reason: "dupes remain" });
    expect(judgeCalls).toBe(0);
  });
});
