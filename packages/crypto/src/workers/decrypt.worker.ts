import { InThreadDecryptService } from "../decrypt-in-thread";
import { serveOffThread } from "../util/worker-client";
import type { RecordCipherContext } from "../vault-data";

export type DecryptRequest =
  | { type: "init"; keys: [keyId: string, key: ArrayBuffer][] }
  | { type: "decrypt"; context: RecordCipherContext; encryptedData: string; nonce: string }
  | { type: "wipe" };

const service = new InThreadDecryptService();

serveOffThread<DecryptRequest>(async (msg) => {
  if (msg.type === "init") {
    service.init(new Map(msg.keys.map(([keyId, key]) => [keyId, new Uint8Array(key)])));
    return { result: null };
  }
  if (msg.type === "wipe") {
    service.wipe();
    return { result: null };
  }
  return { result: await service.decrypt(msg.context, msg.encryptedData, msg.nonce) };
}, "Decryption failed");
