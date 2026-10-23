import type { ChatRequest, ChatResponse, ComputePort } from "../compute";
import { InvalidRequestError, TransientError } from "../errors";

const defaultReply = (request: ChatRequest): string => {
  const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
  return `echo: ${lastUser?.content ?? ""}`;
};

const roughTokens = (text: string): number => Math.ceil(text.length / 4);

/** A fake ComputePort. Deterministic, records every call, and can be told to fail. */
export class FakeCompute implements ComputePort {
  readonly calls: ChatRequest[] = [];
  private pendingFailures = 0;

  constructor(private readonly reply: (request: ChatRequest) => string = defaultReply) {}

  failNext(times = 1): void {
    this.pendingFailures += times;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (request.messages.length === 0) {
      throw new InvalidRequestError("messages must not be empty");
    }
    this.calls.push(request);
    if (this.pendingFailures > 0) {
      this.pendingFailures -= 1;
      throw new TransientError("simulated provider failure");
    }
    const content = this.reply(request);
    const promptText = request.messages.map((m) => m.content).join("\n");
    return {
      content,
      model: request.model ?? "fake-model",
      providerId: "fake-provider",
      usage: { promptTokens: roughTokens(promptText), completionTokens: roughTokens(content) },
    };
  }
}
