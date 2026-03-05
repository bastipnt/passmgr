import { xchacha20poly1305 } from "@noble/ciphers/chacha";

let vaultKey: Uint8Array | null = null;

function fromBase64(input: string): Uint8Array {
  return Uint8Array.fromBase64(input);
}

self.onmessage = (event: MessageEvent) => {
  const msg = event.data as
    | { type: "init"; key: ArrayBuffer }
    | { type: "decrypt"; id: string; encryptedData: string; nonce: string }
    | { type: "wipe" };

  if (msg.type === "init") {
    vaultKey = new Uint8Array(msg.key);
    return;
  }

  if (msg.type === "wipe") {
    if (vaultKey) {
      vaultKey.fill(0);
      vaultKey = null;
    }
    return;
  }

  if (msg.type === "decrypt") {
    if (!vaultKey) {
      self.postMessage({ type: "error", id: msg.id, message: "Worker not initialized" });
      return;
    }
    try {
      const chacha = xchacha20poly1305(vaultKey, fromBase64(msg.nonce));
      const bytes = chacha.decrypt(fromBase64(msg.encryptedData));
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
