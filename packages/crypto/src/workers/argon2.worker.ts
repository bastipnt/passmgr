import { type Argon2Params, argon2Async } from "../util/argon2-impl";
import { opaqueScrypt } from "../util/opaque-scrypt";

type KdfRequest =
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
self.onmessage = async (event: MessageEvent<KdfRequest>) => {
  try {
    const result = await run(event.data);
    // @ts-expect-error result buffer
    self.postMessage({ type: "result", key: result.buffer }, [result.buffer]);
  } catch (e) {
    self.postMessage({
      type: "error",
      message: e instanceof Error ? e.message : "Key derivation failed",
    });
  }
};
