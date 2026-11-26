import type { DecryptService } from "./decrypt-service";
import { decryptRecordData, type RecordCipherContext, vaultKeyId } from "./vault-data";

/** Record decryption on the calling thread: React Native, Node, and the decrypt worker itself. */
export class InThreadDecryptService implements DecryptService {
  // `vaultKeyId` (vault + key version) → vault key (ADR 0001 D3).
  private vaultKeys = new Map<string, Uint8Array>();

  init(vaultKeys: Map<string, Uint8Array>): void {
    this.wipe();
    this.vaultKeys = vaultKeys;
  }

  decrypt(context: RecordCipherContext, encryptedData: string, nonce: string): Promise<unknown> {
    const key = this.vaultKeys.get(vaultKeyId(context.vaultId, context.keyVersion));
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
