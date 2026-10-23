import type { ChatMessage, ComputePort } from "@autonix/ports";
import { extractJson } from "./json-extract";
import type { Plan, Step } from "./types";

export class PlanningError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PlanningError";
  }
}

function isStep(value: unknown): value is Step {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.description === "string" &&
    typeof v.successCriteria === "string" &&
    typeof v.tool === "string" &&
    "input" in v
  );
}

function validatePlan(raw: unknown, goal: string): Plan {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !Array.isArray((raw as { steps?: unknown }).steps)
  ) {
    throw new PlanningError("plan is missing a steps array");
  }
  const steps = (raw as { steps: unknown[] }).steps;
  if (steps.length === 0) {
    throw new PlanningError("plan has zero steps");
  }
  for (const s of steps) {
    if (!isStep(s)) throw new PlanningError(`malformed step: ${JSON.stringify(s).slice(0, 200)}`);
  }
  return { goal, steps: steps as Step[] };
}

function systemPrompt(availableTools: string[]): string {
  return [
    "You are a planning assistant. Break the user's goal into an ordered list of steps.",
    `Available tools: ${availableTools.join(", ")}.`,
    "Respond with ONLY a JSON object of the exact shape:",
    '{"steps":[{"id":"s1","description":"...","successCriteria":"...","tool":"<one of the available tools>","input":<any JSON>}]}',
    "No prose before or after the JSON. Keep steps to the minimum needed.",
  ].join("\n");
}

/** Plans a goal into steps. Retries once if the model's output can't be parsed or validated. */
export async function planGoal(
  compute: ComputePort,
  goal: string,
  availableTools: string[],
): Promise<Plan> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(availableTools) },
    { role: "user", content: goal },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await compute.chat({ messages });
    try {
      const raw = extractJson(reply.content);
      return validatePlan(raw, goal);
    } catch (err) {
      if (attempt === 1) {
        throw new PlanningError(
          `could not get a valid plan after retrying: ${(err as Error).message}`,
          err,
        );
      }
      messages.push(
        { role: "assistant", content: reply.content },
        {
          role: "user",
          content:
            "That was not valid JSON matching the required shape. Reply with ONLY the JSON object, nothing else.",
        },
      );
    }
  }
  // unreachable, satisfies TypeScript's control-flow analysis
  throw new PlanningError("planGoal: unreachable");
}

function validateSteps(raw: unknown): Step[] {
  if (!Array.isArray((raw as { steps?: unknown })?.steps)) {
    throw new PlanningError("replan response is missing a steps array");
  }
  const steps = (raw as { steps: unknown[] }).steps;
  for (const s of steps) {
    if (!isStep(s))
      throw new PlanningError(`malformed replanned step: ${JSON.stringify(s).slice(0, 200)}`);
  }
  return steps as Step[];
}

/** Called when a step fails verification. Gives the model what was learned and
 * asks it to revise the remaining work — this is "Adapt" in the loop, not a
 * generic retry of the exact same failed step. */
export async function replanRemainingSteps(
  compute: ComputePort,
  goal: string,
  availableTools: string[],
  failedStep: Step,
  failureReason: string,
  remainingSteps: Step[],
): Promise<Step[]> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(availableTools) },
    {
      role: "user",
      content: [
        `Original goal: ${goal}`,
        `This step failed: ${failedStep.description} (tool: ${failedStep.tool})`,
        `Reason it failed: ${failureReason}`,
        `Steps still remaining after it (may need to change too): ${JSON.stringify(remainingSteps)}`,
        "",
        "Revise the remaining steps (including replacing the failed one if needed) given what was learned.",
        'Respond with ONLY JSON: {"steps":[...]} in the same shape as before.',
      ].join("\n"),
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await compute.chat({ messages });
    try {
      const raw = extractJson(reply.content);
      return validateSteps(raw);
    } catch (err) {
      if (attempt === 1) {
        throw new PlanningError(
          `could not get a valid replan after retrying: ${(err as Error).message}`,
          err,
        );
      }
      messages.push(
        { role: "assistant", content: reply.content },
        {
          role: "user",
          content:
            "That was not valid JSON matching the required shape. Reply with ONLY the JSON object, nothing else.",
        },
      );
    }
  }
  throw new PlanningError("replanRemainingSteps: unreachable");
}
