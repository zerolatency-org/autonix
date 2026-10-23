import { describe, expect, it } from "vitest";
import type { ComputePort } from "../compute";
import { InvalidRequestError } from "../errors";

/** The rules EVERY ComputePort must follow. */
export function runComputePortContract(name: string, make: () => ComputePort): void {
  describe(`ComputePort contract: ${name}`, () => {
    it("returns a non-empty reply for a simple prompt", async () => {
      const compute = make();
      const reply = await compute.chat({ messages: [{ role: "user", content: "Say hi" }] });
      expect(reply.content.length).toBeGreaterThan(0);
      expect(typeof reply.model).toBe("string");
    });

    it("rejects an empty message list", async () => {
      const compute = make();
      await expect(compute.chat({ messages: [] })).rejects.toBeInstanceOf(InvalidRequestError);
    });
  });
}
