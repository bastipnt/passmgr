import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import {
  type DecryptedRecord,
  type RecordData,
  type RecordPayload,
  upgradeRecordPayload,
} from "@repo/schema";
import {
  type LocalRecordVersion,
  type StoredRecordCiphertext,
  secretsStore,
  storedRecordContext,
} from "@repo/store";

export function decryptRecord(row: StoredRecordCiphertext): RecordPayload {
  const bytes = secretsStore.decryptRecord(row);
  return upgradeRecordPayload(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function decryptRecordWithWorker(row: StoredRecordCiphertext): Promise<RecordPayload> {
  const payload = await decryptWorkerService.decrypt(
    storedRecordContext(row),
    row.encryptedData,
    row.encryptionNonce,
  );
  return upgradeRecordPayload(payload);
}

/**
 * A stored version, decrypted in the worker, with where it lives. Rows of one
 * record's history carry no first-created date: pass null.
 */
export async function decryptRecordRow(
  row: LocalRecordVersion,
  firstCreatedAt = row.firstCreatedAt ?? null,
): Promise<DecryptedRecord> {
  return {
    ...(await decryptRecordWithWorker(row)),
    recordId: row.recordId,
    vaultId: row.vaultId,
    version: row.version,
    clientUpdatedAt: row.clientUpdatedAt,
    created_at: row.created_at ?? null,
    firstCreatedAt,
  };
}

/** A decrypted record's content, without where and when it was stored. */
export function recordDataOf(record: DecryptedRecord): RecordData {
  const {
    recordId: _recordId,
    vaultId: _vaultId,
    version: _version,
    clientUpdatedAt: _clientUpdatedAt,
    created_at: _createdAt,
    firstCreatedAt: _firstCreatedAt,
    schemaVersion: _schemaVersion,
    ...data
  } = record;
  return data;
}

/** Hand the decrypt worker the current vault keys (after an unlock or a vault list change). */
export function initDecryptWorker() {
  decryptWorkerService.init(secretsStore.exportVaultKeysForWorker());
}
