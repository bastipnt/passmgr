import { type Argon2Params, argon2Async } from "../util/argon2-impl";
import { opaqueScrypt } from "../util/opaque-scrypt";
import { serveOffThread } from "../util/worker-client";

export type KdfRequest =
  | {
      type: "derive";
      password: string | Uint8Array;
      salt: ArrayBuffer;
      params: Argon2Params;
    }
  | { type: "opaque-ksf"; input: ArrayBuffer };

async function run(msg: KdfRequest): Promise<Uint8Array> {
  if (msg.type === "opaque-ksf") return opaqueScrypt(new Uint8Array(msg.input));
  const { variant = "argon2id", ...opts } = msg.params;
  return argon2Async(variant, msg.password, new Uint8Array(msg.salt), opts);
}

// Argon2 (password KEK) and OPAQUE's scrypt KSF: both too slow for the main thread.
serveOffThread<KdfRequest>(async (msg) => {
  const key = (await run(msg)).buffer as ArrayBuffer;
  return { result: key, transfer: [key] };
}, "Key derivation failed");
