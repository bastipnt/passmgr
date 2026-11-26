import { InThreadDecryptService } from "../decrypt-in-thread";
import type { DecryptService } from "../decrypt-service";
import { hasWorker, WorkerClient } from "../util/worker-client";
import type { RecordCipherContext } from "../vault-data";
import type { DecryptRequest } from "../workers/decrypt.worker";
// oxlint-disable-next-line import/default -- Vite ?worker import
import DecryptWorker from "../workers/decrypt.worker.ts?worker";

const client = new WorkerClient(() => new DecryptWorker(), "Decrypt worker");
const inThread = new InThreadDecryptService();

function send(request: DecryptRequest, transfer: Transferable[] = []): void {
  // A worker error already fails the decrypts that depend on this; nothing waits on it.
  client.request(request, transfer).catch(() => {});
}

export const decryptWorkerService: DecryptService = {
  /** The buffers are transferred to the worker: the caller passes copies. */
  init(vaultKeys: Map<string, Uint8Array>): void {
    if (!hasWorker()) return inThread.init(vaultKeys);
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
