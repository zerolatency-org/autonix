import { describe, expect, it } from "vitest";
import { NotFoundError } from "../errors";
import type { StoragePort } from "../storage";

const bytes = (text: string) => new TextEncoder().encode(text);

/**
 * The rules EVERY StoragePort must follow. Run this against the fake now
 * and against the real 0G adapter later.
 */
export function runStoragePortContract(name: string, make: () => StoragePort): void {
  describe(`StoragePort contract: ${name}`, () => {
    it("round-trips bytes", async () => {
      const storage = make();
      const id = await storage.put(bytes("hello agent"));
      expect(await storage.get(id)).toEqual(bytes("hello agent"));
    });

    it("is content-addressed: same bytes give the same id", async () => {
      const storage = make();
      const a = await storage.put(bytes("same"));
      const b = await storage.put(bytes("same"));
      expect(a).toBe(b);
    });

    it("gives different ids for different bytes", async () => {
      const storage = make();
      const a = await storage.put(bytes("one"));
      const b = await storage.put(bytes("two"));
      expect(a).not.toBe(b);
    });

    it("throws NotFoundError for an unknown id", async () => {
      const storage = make();
      await expect(storage.get(`0x${"00".repeat(32)}`)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("has() reflects what was stored", async () => {
      const storage = make();
      const id = await storage.put(bytes("present"));
      expect(await storage.has(id)).toBe(true);
      expect(await storage.has(`0x${"11".repeat(32)}`)).toBe(false);
    });

    it("returns a copy, so callers cannot corrupt stored data", async () => {
      const storage = make();
      const id = await storage.put(bytes("immutable"));
      const first = await storage.get(id);
      first[0] = 0;
      expect(await storage.get(id)).toEqual(bytes("immutable"));
    });
  });
}
