import { CURRENT_CRYPTO_VERSION, type RecordSchema } from "@repo/schema";
import { secretsStore } from "@repo/store";

/**
 * Encrypt a record payload under its vault's key. The ciphertext only opens as
 * this record in this vault: a move to another vault re-encrypts.
 */
export function encryptRecord(
  payload: RecordSchema,
  context: { recordId: string; vaultId: string },
): { encryptedData: string; encryptionNonce: string; cryptoVersion: number } {
  const [encryptedData, encryptionNonce] = secretsStore.encryptRecord(
    context,
    JSON.stringify(payload),
  );
  return { encryptedData, encryptionNonce, cryptoVersion: CURRENT_CRYPTO_VERSION };
}
