import { describe, expect, it } from "vitest";
import { TransientError } from "../errors";
import { runComputePortContract } from "../testing";
import { FakeCompute } from "./fake-compute";

runComputePortContract("FakeCompute", () => new FakeCompute());

describe("FakeCompute", () => {
  it("echoes the last user message by default", async () => {
    const compute = new FakeCompute();
    const reply = await compute.chat({
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "ping" },
      ],
    });
    expect(reply.content).toBe("echo: ping");
  });

  it("records every request it receives", async () => {
    const compute = new FakeCompute();
    await compute.chat({ messages: [{ role: "user", content: "a" }] });
    await compute.chat({ messages: [{ role: "user", content: "b" }] });
    expect(compute.calls).toHaveLength(2);
  });

  it("fails on demand, then recovers", async () => {
    const compute = new FakeCompute();
    compute.failNext();
    const req = { messages: [{ role: "user" as const, content: "hi" }] };
    await expect(compute.chat(req)).rejects.toBeInstanceOf(TransientError);
    await expect(compute.chat(req)).resolves.toMatchObject({ content: "echo: hi" });
  });
});
