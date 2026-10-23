/**
 * Content-addressed blob storage.
 * In production this is backed by 0G Storage; in tests it is in memory.
 */
export interface StoragePort {
  /** Store bytes and return their content id (a root hash). Same bytes give the same id. */
  put(bytes: Uint8Array): Promise<string>;
  /** Fetch bytes by content id. Throws NotFoundError if the id is unknown. */
  get(id: string): Promise<Uint8Array>;
  /** True if the id is known. */
  has(id: string): Promise<boolean>;
}
