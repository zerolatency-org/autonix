import { FakeCompute } from "@autonix/ports";
import { describe, expect, it } from "vitest";
import { PlanningError, planGoal, replanRemainingSteps } from "./planner";

const validPlanJson = JSON.stringify({
  steps: [
    {
      id: "s1",
      description: "search for X",
      successCriteria: "found X",
      tool: "search",
      input: { q: "X" },
    },
  ],
});

describe("planGoal", () => {
  it("parses a valid plan on the first try", async () => {
    const compute = new FakeCompute(() => validPlanJson);
    const plan = await planGoal(compute, "find X", ["search"]);
    expect(plan.goal).toBe("find X");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.tool).toBe("search");
  });

  it("retries once if the first reply is not valid JSON, then succeeds", async () => {
    let call = 0;
    const compute = new FakeCompute(() => {
      call++;
      return call === 1 ? "sorry, I cannot help with that" : validPlanJson;
    });
    const plan = await planGoal(compute, "find X", ["search"]);
    expect(plan.steps).toHaveLength(1);
    expect(call).toBe(2);
  });

  it("throws PlanningError if both attempts fail", async () => {
    const compute = new FakeCompute(() => "not json at all, sorry");
    await expect(planGoal(compute, "find X", ["search"])).rejects.toBeInstanceOf(PlanningError);
  });

  it("rejects a plan with zero steps", async () => {
    const compute = new FakeCompute(() => JSON.stringify({ steps: [] }));
    await expect(planGoal(compute, "find X", ["search"])).rejects.toBeInstanceOf(PlanningError);
  });

  it("rejects a step missing required fields", async () => {
    const compute = new FakeCompute(() => JSON.stringify({ steps: [{ id: "s1" }] }));
    await expect(planGoal(compute, "find X", ["search"])).rejects.toBeInstanceOf(PlanningError);
  });
});

describe("replanRemainingSteps", () => {
  it("returns a revised steps array", async () => {
    const revised = JSON.stringify({
      steps: [
        {
          id: "s2",
          description: "try a different search",
          successCriteria: "found X",
          tool: "search",
          input: { q: "X alternate" },
        },
      ],
    });
    const compute = new FakeCompute(() => revised);
    const steps = await replanRemainingSteps(
      compute,
      "find X",
      ["search"],
      {
        id: "s1",
        description: "search for X",
        successCriteria: "found X",
        tool: "search",
        input: { q: "X" },
      },
      "no results found",
      [],
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]?.id).toBe("s2");
  });
});
