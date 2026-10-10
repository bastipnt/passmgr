import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import { type EncryptedRecordSchema, type RecordPayload, upgradeRecordPayload } from "@repo/schema";
import { secretsStore } from "@repo/store";

type EncryptedRow = Pick<
  EncryptedRecordSchema,
  "recordId" | "vaultId" | "cryptoVersion" | "keyVersion" | "encryptedData" | "encryptionNonce"
>;

export function decryptRecord(row: EncryptedRow): RecordPayload {
  const bytes = secretsStore.decryptRecord(row);
  return upgradeRecordPayload(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function decryptRecordWithWorker(row: EncryptedRow): Promise<RecordPayload> {
  const { recordId, vaultId, cryptoVersion } = row;
  const payload = await decryptWorkerService.decrypt(
    { recordId, vaultId, cryptoVersion },
    row.keyVersion,
    row.encryptedData,
    row.encryptionNonce,
  );
  return upgradeRecordPayload(payload);
}

/** Hand the decrypt worker the current vault keys (after an unlock or a vault list change). */
export function initDecryptWorker() {
  decryptWorkerService.init(secretsStore.exportVaultKeysForWorker());
}
