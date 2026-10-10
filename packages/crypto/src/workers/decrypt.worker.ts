import type { RecordCipherContext } from "../vault-data";
import { decryptRecordData, vaultKeyId } from "../vault-data";

// `vaultKeyId` (vault + key version) → vault key (ADR 0001 D3).
let vaultKeys = new Map<string, Uint8Array>();

function wipeKeys() {
  for (const key of vaultKeys.values()) key.fill(0);
  vaultKeys = new Map();
}

self.onmessage = (event: MessageEvent) => {
  const msg = event.data as
    | { type: "init"; keys: [keyId: string, key: ArrayBuffer][] }
    | {
        type: "decrypt";
        id: string;
        context: RecordCipherContext;
        keyVersion: number;
        encryptedData: string;
        nonce: string;
      }
    | { type: "wipe" };

  if (msg.type === "init") {
    wipeKeys();
    vaultKeys = new Map(msg.keys.map(([keyId, key]) => [keyId, new Uint8Array(key)]));
    return;
  }

  if (msg.type === "wipe") {
    wipeKeys();
    return;
  }

  if (msg.type === "decrypt") {
    const key = vaultKeys.get(vaultKeyId(msg.context.vaultId, msg.keyVersion));
    if (!key) {
      self.postMessage({ type: "error", id: msg.id, message: "No key for vault" });
      return;
    }
    try {
      const bytes = decryptRecordData(key, msg.context, msg.encryptedData, msg.nonce);
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      self.postMessage({ type: "result", id: msg.id, payload });
    } catch (e) {
      self.postMessage({
        type: "error",
        id: msg.id,
        message: e instanceof Error ? e.message : "Decryption failed",
      });
    }
  }
};
