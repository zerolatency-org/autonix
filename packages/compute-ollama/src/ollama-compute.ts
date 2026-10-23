import type { ChatRequest, ChatResponse, ComputePort } from "@autonix/ports";
import { InvalidRequestError, TransientError } from "@autonix/ports";

export interface OllamaComputeOptions {
  baseUrl?: string;
  defaultModel: string;
}

interface OllamaResponse {
  message?: {
    content?: unknown;
  };
  model?: unknown;
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  error?: unknown;
}

export class OllamaCompute implements ComputePort {
  private readonly chatUrl: string;
  private readonly defaultModel: string;

  constructor(options: OllamaComputeOptions) {
    this.chatUrl = `${options.baseUrl ?? "http://127.0.0.1:11434"}/api/chat`;
    this.defaultModel = options.defaultModel;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (request.messages.length === 0) {
      throw new InvalidRequestError("messages must not be empty");
    }

    const model = request.model ?? this.defaultModel;
    let response: Response;
    try {
      response = await fetch(this.chatUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: request.messages,
          stream: false,
          ...(request.maxTokens === undefined
            ? {}
            : { options: { num_predict: request.maxTokens } }),
        }),
      });
    } catch (error) {
      throw new TransientError(`Ollama request failed: ${errorMessage(error)}`, { cause: error });
    }

    let body: OllamaResponse;
    try {
      body = (await response.json()) as OllamaResponse;
    } catch (error) {
      throw new TransientError("Ollama returned invalid JSON", { cause: error });
    }

    if (!response.ok) {
      throw new TransientError(`Ollama returned HTTP ${response.status}: ${formatError(body.error)}`);
    }

    const content = body.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new TransientError("Ollama response did not contain assistant message content");
    }

    const responseModel = typeof body.model === "string" ? body.model : model;
    const usage =
      typeof body.prompt_eval_count === "number" && typeof body.eval_count === "number"
        ? { promptTokens: body.prompt_eval_count, completionTokens: body.eval_count }
        : undefined;

    return {
      content,
      model: responseModel,
      providerId: "ollama",
      usage,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatError(error: unknown): string {
  return typeof error === "string" && error.length > 0 ? error : "unknown error";
}