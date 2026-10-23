import { describe, expect, it } from "vitest";
import { runChainPortContract } from "../testing";
import { FakeChain } from "./fake-chain";

runChainPortContract("FakeChain", () => new FakeChain());

describe("FakeChain", () => {
  it("mines blocks", async () => {
    const chain = new FakeChain();
    chain.mine(3n);
    expect(await chain.getBlockNumber()).toBe(3n);
  });

  it("treats addresses case-insensitively", async () => {
    const chain = new FakeChain();
    chain.setBalance("0xAbCdEf0000000000000000000000000000000000", 5n);
    expect(await chain.getBalance("0xabcdef0000000000000000000000000000000000")).toBe(5n);
  });
});
