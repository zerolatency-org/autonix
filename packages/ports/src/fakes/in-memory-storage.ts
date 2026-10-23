import { createHash } from "node:crypto";
import { NotFoundError, TransientError } from "../errors";
import type { StoragePort } from "../storage";

/** A fake StoragePort. The id is a SHA-256 of the bytes, so it is content-addressed. */
export class InMemoryStorage implements StoragePort {
  private readonly blobs = new Map<string, Uint8Array>();
  private pendingPutFailures = 0;
  private pendingGetFailures = 0;

  /** Make the next `times` calls of `kind` throw a TransientError (for failure tests). */
  failNext(kind: "put" | "get", times = 1): void {
    if (kind === "put") this.pendingPutFailures += times;
    else this.pendingGetFailures += times;
  }

  async put(bytes: Uint8Array): Promise<string> {
    if (this.pendingPutFailures > 0) {
      this.pendingPutFailures -= 1;
      throw new TransientError("simulated storage put failure");
    }
    const id = `0x${createHash("sha256").update(bytes).digest("hex")}`;
    this.blobs.set(id, bytes.slice());
    return id;
  }

  async get(id: string): Promise<Uint8Array> {
    if (this.pendingGetFailures > 0) {
      this.pendingGetFailures -= 1;
      throw new TransientError("simulated storage get failure");
    }
    const found = this.blobs.get(id);
    if (!found) throw new NotFoundError(`blob ${id}`);
    return found.slice();
  }

  async has(id: string): Promise<boolean> {
    return this.blobs.has(id);
  }
}
