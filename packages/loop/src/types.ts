/** One step in a plan: what to do, which tool runs it, and how to tell if it worked. */
export interface Step {
  id: string;
  description: string;
  /** Plain-language condition the verifier checks the result against. */
  successCriteria: string;
  /** Name of a tool registered in the ToolRegistry, e.g. "search", "hireAgent". */
  tool: string;
  input: unknown;
}

export interface Plan {
  goal: string;
  steps: Step[];
}

export interface StepResult {
  stepId: string;
  ok: boolean;
  output?: unknown;
  error?: string;
}

export interface Verdict {
  pass: boolean;
  /** 0-100. Judge-assigned confidence; deterministic failures are always score 0. */
  score: number;
  reason: string;
}

export type LoopStatus = "done" | "max_replans_exceeded" | "planning_failed";

export interface LoopEvent {
  at: number;
  kind: "planned" | "executed" | "verified" | "replanned" | "finished";
  detail: string;
}

export interface LoopResult {
  goal: string;
  plan: Plan;
  stepResults: StepResult[];
  verdicts: Verdict[];
  replans: number;
  status: LoopStatus;
  events: LoopEvent[];
}
