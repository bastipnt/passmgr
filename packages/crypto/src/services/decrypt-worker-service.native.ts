// Main-thread record decryption for React Native. XChaCha20-Poly1305 decryption
// is fast enough to run on the JS thread, so no web worker is needed here.
// Mirrors the message contract of decrypt.worker.ts.

import { decryptRecordData, type RecordCipherContext, vaultKeyId } from "../vault-data";

class DecryptNativeService {
  private vaultKeys = new Map<string, Uint8Array>();

  /** Take over the given vault keys (`vaultKeyId` → key), replacing any held. */
  init(vaultKeys: Map<string, Uint8Array>): void {
    this.wipe();
    this.vaultKeys = vaultKeys;
  }

  /** The parsed JSON payload, unchecked: the caller upgrades and types it. */
  decrypt(
    context: RecordCipherContext,
    keyVersion: number,
    encryptedData: string,
    nonce: string,
  ): Promise<unknown> {
    const key = this.vaultKeys.get(vaultKeyId(context.vaultId, keyVersion));
    if (!key) return Promise.reject(new Error("No key for vault"));
    try {
      const bytes = decryptRecordData(key, context, encryptedData, nonce);
      return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error("Decryption failed"));
    }
  }

  wipe(): void {
    for (const key of this.vaultKeys.values()) key.fill(0);
    this.vaultKeys = new Map();
  }
}

export const decryptWorkerService = new DecryptNativeService();
