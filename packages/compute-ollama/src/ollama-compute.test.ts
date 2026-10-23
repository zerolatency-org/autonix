import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { InvalidRequestError, TransientError } from "@autonix/ports";
import { runComputePortContract } from "@autonix/ports/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OllamaCompute } from "./ollama-compute";

/**
 * A tiny stand-in for a running Ollama server. This is NOT Ollama itself —
 * it only proves OllamaCompute builds the right request and parses the right
 * response shape. Point OLLAMA_BASE_URL at a real Ollama instance and re-run
 * the same contract test against it for the real end-to-end proof.
 */
function startFakeOllama(handler: (body: unknown) => { status: number; body: unknown }): Promise<{
  server: Server;
  baseUrl: string;
  requests: unknown[];
}> {
  const requests: unknown[] = [];
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        const parsed = raw ? JSON.parse(raw) : {};
        requests.push(parsed);
        const { status, body } = handler(parsed);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(typeof body === "string" ? body : JSON.stringify(body));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, requests });
    });
  });
}

describe("OllamaCompute against the shared ComputePort contract", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const started = await startFakeOllama((body) => {
      const messages = (body as { messages: { role: string; content: string }[] }).messages;
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      return {
        status: 200,
        body: {
          message: { role: "assistant", content: `echo: ${lastUser?.content ?? ""}` },
          model: "fake",
        },
      };
    });
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(() => server.close());

  runComputePortContract(
    "OllamaCompute",
    () => new OllamaCompute({ baseUrl, defaultModel: "test-model" }),
  );
});

describe("OllamaCompute specifics", () => {
  let server: Server;
  let baseUrl: string;
  let requests: unknown[];

  afterEach(() => server?.close());

  it("sends the messages and model Ollama expects", async () => {
    const started = await startFakeOllama(() => ({
      status: 200,
      body: { message: { role: "assistant", content: "hi" }, model: "llama3.1:8b" },
    }));
    server = started.server;
    baseUrl = started.baseUrl;
    requests = started.requests;

    const compute = new OllamaCompute({ baseUrl, defaultModel: "llama3.1:8b" });
    await compute.chat({ messages: [{ role: "user", content: "hello" }] });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      model: "llama3.1:8b",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    });
  });

  it("reports the real model name and token usage back", async () => {
    const started = await startFakeOllama(() => ({
      status: 200,
      body: {
        message: { role: "assistant", content: "ok" },
        model: "llama3.1:8b",
        prompt_eval_count: 42,
        eval_count: 13,
      },
    }));
    server = started.server;
    baseUrl = started.baseUrl;

    const compute = new OllamaCompute({ baseUrl, defaultModel: "llama3.1:8b" });
    const reply = await compute.chat({ messages: [{ role: "user", content: "hi" }] });

    expect(reply.model).toBe("llama3.1:8b");
    expect(reply.providerId).toBe("ollama");
    expect(reply.usage).toEqual({ promptTokens: 42, completionTokens: 13 });
  });

  it("throws TransientError on a non-2xx response", async () => {
    const started = await startFakeOllama(() => ({
      status: 500,
      body: { error: "model not found" },
    }));
    server = started.server;
    baseUrl = started.baseUrl;

    const compute = new OllamaCompute({ baseUrl, defaultModel: "missing-model" });
    await expect(
      compute.chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(TransientError);
  });

  it("throws TransientError when the response has no message content", async () => {
    const started = await startFakeOllama(() => ({ status: 200, body: { model: "x" } }));
    server = started.server;
    baseUrl = started.baseUrl;

    const compute = new OllamaCompute({ baseUrl, defaultModel: "x" });
    await expect(
      compute.chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(TransientError);
  });

  it("throws TransientError when nothing is listening at baseUrl", async () => {
    const compute = new OllamaCompute({ baseUrl: "http://127.0.0.1:1", defaultModel: "x" });
    await expect(
      compute.chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(TransientError);
  });

  it("rejects an empty message list before making any request", async () => {
    const compute = new OllamaCompute({ baseUrl: "http://127.0.0.1:1", defaultModel: "x" });
    await expect(compute.chat({ messages: [] })).rejects.toBeInstanceOf(InvalidRequestError);
  });

  it("uses the request's own model over the default when given", async () => {
    const started = await startFakeOllama(() => ({
      status: 200,
      body: { message: { role: "assistant", content: "ok" } },
    }));
    server = started.server;
    baseUrl = started.baseUrl;
    requests = started.requests;

    const compute = new OllamaCompute({ baseUrl, defaultModel: "default-model" });
    await compute.chat({ messages: [{ role: "user", content: "hi" }], model: "requested-model" });

    expect(requests[0]).toMatchObject({ model: "requested-model" });
  });
});