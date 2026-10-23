import { describe, expect, it } from "vitest";
import { TransientError } from "../errors";
import { runStoragePortContract } from "../testing";
import { InMemoryStorage } from "./in-memory-storage";

runStoragePortContract("InMemoryStorage", () => new InMemoryStorage());

describe("InMemoryStorage failure injection", () => {
  it("fails the next put, then recovers", async () => {
    const storage = new InMemoryStorage();
    storage.failNext("put");
    const data = new TextEncoder().encode("x");
    await expect(storage.put(data)).rejects.toBeInstanceOf(TransientError);
    await expect(storage.put(data)).resolves.toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("fails the next get, then recovers", async () => {
    const storage = new InMemoryStorage();
    const id = await storage.put(new TextEncoder().encode("y"));
    storage.failNext("get");
    await expect(storage.get(id)).rejects.toBeInstanceOf(TransientError);
    await expect(storage.get(id)).resolves.toBeInstanceOf(Uint8Array);
  });
});
