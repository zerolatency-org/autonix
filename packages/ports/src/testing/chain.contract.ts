import { describe, expect, it } from "vitest";
import type { ChainPort } from "../chain";

/** The rules EVERY ChainPort must follow. */
export function runChainPortContract(name: string, make: () => ChainPort): void {
  describe(`ChainPort contract: ${name}`, () => {
    it("returns a non-negative block number", async () => {
      const chain = make();
      expect(await chain.getBlockNumber()).toBeGreaterThanOrEqual(0n);
    });

    it("returns 0n for an address nobody has used", async () => {
      const chain = make();
      const fresh = `0x${"ab".repeat(20)}`;
      expect(await chain.getBalance(fresh)).toBe(0n);
    });
  });
}
