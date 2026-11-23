import type { RecordCipherContext } from "./vault-data";

/** Record decryption off the caller's hands: the web worker and the React Native main thread. */
export interface DecryptService {
  /** Take the vault keys (`vaultKeyId` → key), replacing any held; the caller loses the buffers. */
  init(vaultKeys: Map<string, Uint8Array>): void;
  /** The parsed JSON payload, unchecked: the caller upgrades and types it. */
  decrypt(context: RecordCipherContext, encryptedData: string, nonce: string): Promise<unknown>;
  /** Drop every key held and reject pending decrypts. */
  wipe(): void;
}
