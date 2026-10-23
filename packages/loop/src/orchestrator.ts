import type { ComputePort } from "@autonix/ports";
import { executeStep } from "./executor";
import { type PlanningError, planGoal, replanRemainingSteps } from "./planner";
import type { ToolRegistry } from "./tool-registry";
import type { LoopEvent, LoopResult, Step, StepResult } from "./types";
import { type DeterministicCheck, verifyStep } from "./verifier";

export interface RunLoopOptions {
  compute: ComputePort;
  tools: ToolRegistry;
  availableToolNames: string[];
  /** Deterministic checks to run for a given step's tool, before any judge call. */
  checksFor?: (toolName: string) => DeterministicCheck[];
  /** How many times the loop may re-plan after a failure before giving up. */
  maxReplans?: number;
  executeStep?: (step: Step, tools: ToolRegistry) => Promise<StepResult>;
}

function event(events: LoopEvent[], kind: LoopEvent["kind"], detail: string): void {
  events.push({ at: Date.now(), kind, detail });
}

/**
 * The whole point of the project in one function: Plan -> Execute -> Verify -> Adapt,
 * repeated until the goal is met or `maxReplans` is exhausted. Whether a step runs a
 * local tool or hires another agent through escrow (Phase 3), this loop does not change
 * — that decision lives inside the tool a step names, not in this control flow.
 */
export async function runLoop(goal: string, options: RunLoopOptions): Promise<LoopResult> {
  const { compute, tools, availableToolNames, checksFor, maxReplans = 2 } = options;
  const runStep = options.executeStep ?? executeStep;
  const events: LoopEvent[] = [];

  let plan: Awaited<ReturnType<typeof planGoal>>;
  try {
    plan = await planGoal(compute, goal, availableToolNames);
  } catch (err) {
    event(events, "finished", `planning failed: ${(err as PlanningError).message}`);
    return {
      goal,
      plan: { goal, steps: [] },
      stepResults: [],
      verdicts: [],
      replans: 0,
      status: "planning_failed",
      events,
    };
  }
  event(events, "planned", `${plan.steps.length} step(s)`);

  const stepResults: StepResult[] = [];
  const verdicts = [] as LoopResult["verdicts"];
  let remaining = [...plan.steps];
  let replans = 0;

  while (remaining.length > 0) {
    const step = remaining.shift() as Step;
    const result = await runStep(step, tools);
    event(events, "executed", `${step.id} ok=${result.ok}`);

    const checks = checksFor?.(step.tool) ?? [];
    const verdict = await verifyStep(compute, step, result, checks);
    event(events, "verified", `${step.id} pass=${verdict.pass} (${verdict.reason})`);

    stepResults.push(result);
    verdicts.push(verdict);

    if (verdict.pass) continue;

    if (replans >= maxReplans) {
      event(events, "finished", `max replans (${maxReplans}) exceeded at ${step.id}`);
      return { goal, plan, stepResults, verdicts, replans, status: "max_replans_exceeded", events };
    }

    replans++;
    remaining = await replanRemainingSteps(
      compute,
      goal,
      availableToolNames,
      step,
      verdict.reason,
      remaining,
    );
    event(events, "replanned", `replan #${replans}: ${remaining.length} step(s) remaining`);
  }

  event(events, "finished", "goal met");
  return { goal, plan, stepResults, verdicts, replans, status: "done", events };
}
