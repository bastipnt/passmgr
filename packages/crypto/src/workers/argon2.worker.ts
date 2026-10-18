import { type Argon2Params, argon2Async } from "../util/argon2-impl";

type ArgonRequest = {
  type: "derive";
  password: string | Uint8Array;
  salt: ArrayBuffer;
  params: Argon2Params;
};

self.onmessage = async (event: MessageEvent<ArgonRequest>) => {
  const msg = event.data;

  if (msg.type === "derive") {
    try {
      const salt = new Uint8Array(msg.salt);
      const { variant = "argon2id", ...opts } = msg.params;
      const result = await argon2Async(variant, msg.password, salt, opts);
      // @ts-expect-error result buffer
      self.postMessage({ type: "result", key: result.buffer }, [result.buffer]);
    } catch (e) {
      self.postMessage({
        type: "error",
        message: e instanceof Error ? e.message : "Argon2 failed",
      });
    }
  }
};
