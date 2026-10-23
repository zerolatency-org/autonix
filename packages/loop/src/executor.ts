import type { ToolRegistry } from "./tool-registry";
import type { Step, StepResult } from "./types";

/** Runs one step through its named tool. Never throws — a tool failure becomes a
 * failed StepResult, which the verifier and the adapt loop handle, not a crash. */
export async function executeStep(step: Step, tools: ToolRegistry): Promise<StepResult> {
  if (!tools.has(step.tool)) {
    return { stepId: step.id, ok: false, error: `unknown tool: ${step.tool}` };
  }
  try {
    const output = await tools.run(step.tool, step.input);
    return { stepId: step.id, ok: true, output };
  } catch (err) {
    return { stepId: step.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
