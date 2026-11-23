import { type Argon2Params, argon2Async } from "../util/argon2-impl";
import { runOffThread, WorkerClient } from "../util/worker-client";
import type { KdfRequest } from "../workers/argon2.worker";
// oxlint-disable-next-line import/default -- Vite ?worker import
import Argon2Worker from "../workers/argon2.worker.ts?worker";

// Serial: two memory-hard derivations at once would hold both buffers in the one worker.
const client = new WorkerClient(() => new Argon2Worker(), "Key derivation worker", {
  serial: true,
});

function request(message: KdfRequest, transfer: ArrayBuffer): Promise<Uint8Array> {
  return client.request<ArrayBuffer>(message, [transfer]).then((key) => new Uint8Array(key));
}

export const argon2WorkerService = {
  derive(
    password: string | Uint8Array,
    salt: Uint8Array,
    params: Argon2Params,
  ): Promise<Uint8Array> {
    return runOffThread(
      () => {
        const saltCopy = salt.slice().buffer;
        return request({ type: "derive", password, salt: saltCopy, params }, saltCopy);
      },
      () => {
        const { variant = "argon2id", ...opts } = params;
        return argon2Async(variant, password, salt, opts);
      },
    );
  },

  /** OPAQUE's scrypt KSF (`opaqueScrypt`), off the main thread. Needs a `Worker`: see `opaqueKsf`. */
  opaqueKsf(input: Uint8Array): Promise<Uint8Array> {
    const inputCopy = input.slice().buffer;
    return request({ type: "opaque-ksf", input: inputCopy }, inputCopy);
  },

  terminate(): void {
    client.terminate();
  },
};
