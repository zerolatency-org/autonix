/**
 * Read access to the blockchain (write access is added in Phase 1).
 * In production this is 0G Chain over RPC; in tests it is a fake.
 */
export interface ChainPort {
  getBlockNumber(): Promise<bigint>;
  /** Balance in the smallest unit (wei). Unknown addresses have a balance of 0n. */
  getBalance(address: string): Promise<bigint>;
}
