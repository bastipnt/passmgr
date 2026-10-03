import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import type { EncryptedRecordSchema, RecordSchema } from "@repo/schema";
import { secretsStore } from "@repo/store";

type EncryptedRow = Pick<
  EncryptedRecordSchema,
  "recordId" | "vaultId" | "cryptoVersion" | "encryptedData" | "encryptionNonce"
>;

export function decryptRecord(row: EncryptedRow): RecordSchema {
  const bytes = secretsStore.decryptRecord(row);
  return JSON.parse(new TextDecoder().decode(bytes)) as RecordSchema;
}

export function decryptRecordWithWorker(row: EncryptedRow): Promise<RecordSchema> {
  const { recordId, vaultId, cryptoVersion } = row;
  return decryptWorkerService.decrypt(
    { recordId, vaultId, cryptoVersion },
    row.encryptedData,
    row.encryptionNonce,
  );
}

/** Hand the decrypt worker the current vault keys (after an unlock or a vault list change). */
export function initDecryptWorker() {
  decryptWorkerService.init(secretsStore.exportVaultKeysForWorker());
}
