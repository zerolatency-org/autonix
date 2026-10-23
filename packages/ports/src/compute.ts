export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  providerId?: string;
  usage?: { promptTokens: number; completionTokens: number };
}

/**
 * AI inference.
 * Swappable: a free local model (Ollama) during development, 0G Compute for
 * final integration tests and the live demo. The loop's code never changes.
 */
export interface ComputePort {
  /** Throws InvalidRequestError if `messages` is empty. */
  chat(request: ChatRequest): Promise<ChatResponse>;
}
