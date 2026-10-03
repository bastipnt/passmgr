import { CURRENT_CRYPTO_VERSION, CURRENT_SCHEMA_VERSION, type RecordData } from "@repo/schema";
import { secretsStore } from "@repo/store";

/**
 * Encrypt a record under its vault's key, always in the current payload format
 * (an upgraded payload is written back on its next edit). The ciphertext only
 * opens as this record in this vault: a move to another vault re-encrypts.
 */
export function encryptRecord(
  data: RecordData,
  context: { recordId: string; vaultId: string },
): { encryptedData: string; encryptionNonce: string; cryptoVersion: number } {
  const [encryptedData, encryptionNonce] = secretsStore.encryptRecord(
    context,
    JSON.stringify({ ...data, schemaVersion: CURRENT_SCHEMA_VERSION }),
  );
  return { encryptedData, encryptionNonce, cryptoVersion: CURRENT_CRYPTO_VERSION };
}
