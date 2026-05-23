// Main-thread record decryption for React Native. XChaCha20-Poly1305 decryption
// is fast enough to run on the JS thread, so no web worker is needed here.
// Mirrors the message contract of decrypt.worker.ts.
import { decryptXChaCha } from "../encryption";
import type { RecordSchema } from "@repo/schema";

class DecryptNativeService {
  private vaultKey: Uint8Array | null = null;

  init(vaultKeyBytes: Uint8Array): void {
    this.vaultKey = vaultKeyBytes.slice();
  }

  decrypt(encryptedData: string, nonce: string): Promise<RecordSchema> {
    if (!this.vaultKey) return Promise.reject(new Error("Worker not initialized"));
    const bytes = decryptXChaCha(this.vaultKey, encryptedData, nonce);
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as RecordSchema;
    return Promise.resolve(payload);
  }

  wipe(): void {
    if (this.vaultKey) {
      this.vaultKey.fill(0);
      this.vaultKey = null;
    }
  }
}

export const decryptWorkerService = new DecryptNativeService();
