import type { ChainPort } from "../chain";

/** A fake ChainPort with a block counter and settable balances. */
export class FakeChain implements ChainPort {
  private block = 0n;
  private readonly balances = new Map<string, bigint>();

  mine(blocks = 1n): void {
    this.block += blocks;
  }

  setBalance(address: string, wei: bigint): void {
    this.balances.set(address.toLowerCase(), wei);
  }

  async getBlockNumber(): Promise<bigint> {
    return this.block;
  }

  async getBalance(address: string): Promise<bigint> {
    return this.balances.get(address.toLowerCase()) ?? 0n;
  }
}
