import type { ComputePort } from "@autonix/ports";
import { extractJson } from "./json-extract";
import type { Step, StepResult, Verdict } from "./types";

/** A fast, code-level check that runs before any model call. Return a string
 * explaining the failure, or null if it passes. Phase 3's real tools (CSV
 * validation, schema checks) plug in here; the judge model is the fallback
 * for criteria too fuzzy to check in code. */
export type DeterministicCheck = (result: StepResult) => string | null;

function judgePrompt(step: Step, result: StepResult): string {
  return [
    `Task: ${step.description}`,
    `Success criteria (agreed before the work started): ${step.successCriteria}`,
    `Result to check: ${JSON.stringify(result.output)}`,
    "",
    'Respond with ONLY JSON: {"pass": true|false, "score": 0-100, "reason": "..."}',
  ].join("\n");
}

/** Verifies one step's result against its success criteria — always against what
 * was agreed before the job started, never against anything said afterward. */
export async function verifyStep(
  compute: ComputePort,
  step: Step,
  result: StepResult,
  deterministicChecks: DeterministicCheck[] = [],
): Promise<Verdict> {
  if (!result.ok) {
    return { pass: false, score: 0, reason: result.error ?? "step failed to execute" };
  }

  for (const check of deterministicChecks) {
    const failure = check(result);
    if (failure) return { pass: false, score: 0, reason: failure };
  }

  const reply = await compute.chat({
    messages: [
      {
        role: "system",
        content: "You are a strict verifier. Judge only against the stated criteria.",
      },
      { role: "user", content: judgePrompt(step, result) },
    ],
  });

  try {
    const raw = extractJson<{ pass?: unknown; score?: unknown; reason?: unknown }>(reply.content);
    if (typeof raw.pass !== "boolean") throw new Error("verdict missing boolean pass");
    const score = typeof raw.score === "number" ? raw.score : raw.pass ? 100 : 0;
    const reason = typeof raw.reason === "string" ? raw.reason : "(no reason given)";
    return { pass: raw.pass, score, reason };
  } catch {
    // A judge verdict we can't parse is NOT a pass by default — failing closed
    // here matters as much as the escrow contract failing closed on a bad signature.
    return { pass: false, score: 0, reason: "judge returned an unparseable verdict" };
  }
}
