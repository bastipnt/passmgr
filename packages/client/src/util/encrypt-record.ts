import {
  MAX_RECORD_PAYLOAD_BYTES,
  RECORD_CRYPTO_VERSION,
  type RecordData,
  RecordTooLargeError,
  recordPayloadBytes,
  recordPayloadJson,
} from "@repo/schema";
import { secretsStore } from "@repo/store";

/**
 * Encrypt a record as a draft (sealed for the server at push) under its
 * vault's current key, always in the current payload format (an upgraded
 * payload is written back on its next edit). The ciphertext only
 * opens as this record in this vault: a move to another vault re-encrypts.
 * Throws `RecordTooLargeError` for a payload the server would refuse.
 */
export function encryptRecord(
  data: RecordData,
  context: { recordId: string; vaultId: string },
): { encryptedData: string; encryptionNonce: string; cryptoVersion: number; keyVersion: number } {
  const json = recordPayloadJson(data);
  if (recordPayloadBytes(json) > MAX_RECORD_PAYLOAD_BYTES) throw new RecordTooLargeError();
  const [encryptedData, encryptionNonce, keyVersion] = secretsStore.encryptRecord(context, json);
  return { encryptedData, encryptionNonce, cryptoVersion: RECORD_CRYPTO_VERSION, keyVersion };
}
