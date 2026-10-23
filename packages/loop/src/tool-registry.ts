export type ToolHandler = (input: unknown) => Promise<unknown>;

/** Deliberately minimal: a name-to-handler map. Phase 3 adds a "hireAgent" tool
 * here that opens a JobEscrow job instead of running something locally — the
 * orchestrator's loop logic does not change at all when that happens. */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolHandler>();

  register(name: string, handler: ToolHandler): void {
    this.tools.set(name, handler);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async run(name: string, input: unknown): Promise<unknown> {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`unknown tool: ${name}`);
    return handler(input);
  }
}
