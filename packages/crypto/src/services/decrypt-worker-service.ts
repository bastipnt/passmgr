import { InThreadDecryptService } from "../decrypt-in-thread";
import type { DecryptService } from "../decrypt-service";
import { hasWorker, WorkerClient } from "../util/worker-client";
import type { RecordCipherContext } from "../vault-data";
import type { DecryptRequest } from "../workers/decrypt.worker";
// oxlint-disable-next-line import/default -- Vite ?worker import
import DecryptWorker from "../workers/decrypt.worker.ts?worker";

const inThread = new InThreadDecryptService();

/** Every decrypt after the worker failed, until the next `init`: the failed worker's keys are gone. */
export class DecryptWorkerLoadError extends Error {
  constructor(cause: Error) {
    super(`Decrypt worker could not load (${cause.message})`, { cause });
    this.name = "DecryptWorkerLoadError";
  }
}

let failure: DecryptWorkerLoadError | null = null;

const client = new WorkerClient(() => new DecryptWorker(), "Decrypt worker", {
  onFailure: (error) => {
    failure = new DecryptWorkerLoadError(error);
  },
});

function send(message: DecryptRequest, transfer: Transferable[] = []): void {
  // A worker error is remembered through `onFailure` and fails every later decrypt.
  client.request(message, transfer).catch(() => {});
}

export const decryptWorkerService: DecryptService = {
  /** The buffers are transferred to the worker: the caller passes copies. */
  init(vaultKeys: Map<string, Uint8Array>): void {
    if (!hasWorker()) return inThread.init(vaultKeys);
    failure = null;
    const keys = [...vaultKeys].map(([keyId, key]): [string, ArrayBuffer] => [
      keyId,
      key.buffer as ArrayBuffer,
    ]);
    send(
      { type: "init", keys },
      keys.map(([, buffer]) => buffer),
    );
  },

  decrypt(context: RecordCipherContext, encryptedData: string, nonce: string): Promise<unknown> {
    if (!hasWorker()) return inThread.decrypt(context, encryptedData, nonce);
    if (failure) return Promise.reject(failure);
    return client.request({
      type: "decrypt",
      context,
      encryptedData,
      nonce,
    } satisfies DecryptRequest);
  },

  wipe(): void {
    if (!hasWorker()) return inThread.wipe();
    client.cancel(new Error("Session wiped"));
    if (client.started) send({ type: "wipe" });
  },
};
