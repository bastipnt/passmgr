import { argon2idAsync } from "@noble/hashes/argon2.js";

type ArgonRequest = {
  type: "derive";
  password: string;
  salt: ArrayBuffer;
  params: { t: number; m: number; p: number };
};

self.onmessage = async (event: MessageEvent<ArgonRequest>) => {
  const msg = event.data;

  if (msg.type === "derive") {
    try {
      const salt = new Uint8Array(msg.salt);
      const result = await argon2idAsync(msg.password, salt, msg.params);
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
