import type { DecryptService } from "../decrypt-service";
import type { RecordCipherContext } from "../vault-data";
// oxlint-disable-next-line import/default -- Vite ?worker import
import DecryptWorker from "../workers/decrypt.worker.ts?worker";

type PendingDecrypt = {
  resolve: (payload: unknown) => void;
  reject: (reason: Error) => void;
};

class DecryptWorkerService implements DecryptService {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingDecrypt>();
  private nextRequestId = 0;

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new DecryptWorker();
      this.worker.onmessage = (event: MessageEvent) => {
        const msg = event.data as
          | { type: "result"; id: string; payload: unknown }
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

  private createRequestId(): string {
    return `req_${++this.nextRequestId}`;
  }

  /** The buffers are transferred to the worker: the caller passes copies. */
  init(vaultKeys: Map<string, Uint8Array>): void {
    const keys = [...vaultKeys].map(([keyId, key]) => [keyId, key.buffer] as const);
    this.getWorker().postMessage(
      { type: "init", keys },
      keys.map(([, buffer]) => buffer as ArrayBuffer),
    );
  }

  decrypt(context: RecordCipherContext, encryptedData: string, nonce: string): Promise<unknown> {
    const id = this.createRequestId();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.getWorker().postMessage({
        type: "decrypt",
        id,
        context,
        encryptedData,
        nonce,
      });
    });
  }

  wipe(): void {
    if (this.worker) {
      this.worker.postMessage({ type: "wipe" });
    }
    for (const [, callbacks] of this.pending) {
      callbacks.reject(new Error("Session wiped"));
    }
    this.pending.clear();
  }
}

export const decryptWorkerService = new DecryptWorkerService();
