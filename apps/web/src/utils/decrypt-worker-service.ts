import type { ItemPayload } from "@repo/schema";
import DecryptWorker from "../workers/decrypt.worker.ts?worker";

type PendingDecrypt = {
  resolve: (payload: ItemPayload) => void;
  reject: (reason: Error) => void;
};

class DecryptWorkerService {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingDecrypt>();

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new DecryptWorker();
      this.worker.onmessage = (event: MessageEvent) => {
        const msg = event.data as
          | { type: "result"; id: string; payload: ItemPayload }
          | { type: "error"; id: string; message: string };

        const callbacks = this.pending.get(msg.id);
        if (!callbacks) return;
        this.pending.delete(msg.id);

        if (msg.type === "result") {
          callbacks.resolve(msg.payload);
        } else {
          callbacks.reject(new Error(msg.message));
        }
      };
    }
    return this.worker;
  }

  init(vaultKeyBytes: Uint8Array): void {
    const worker = this.getWorker();
    // Transfer a copy so we don't transfer the original buffer
    const copy = vaultKeyBytes.slice();
    worker.postMessage({ type: "init", key: copy.buffer }, [copy.buffer]);
  }

  decrypt(id: string, encryptedData: string, nonce: string): Promise<ItemPayload> {
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.getWorker().postMessage({ type: "decrypt", id, encryptedData, nonce });
    });
  }

  wipe(): void {
    if (this.worker) {
      this.worker.postMessage({ type: "wipe" });
    }
    // Reject any in-flight requests
    for (const [, callbacks] of this.pending) {
      callbacks.reject(new Error("Session wiped"));
    }
    this.pending.clear();
  }
}

export const decryptWorkerService = new DecryptWorkerService();
