import type { RecordType } from "@repo/db";

/** A stored version as the client sees it. */
export function serializeRecord(record: RecordType) {
  const {
    rowId: _rowId,
    userId: _userId,
    seq: _seq,
    clientChangeId: _clientChangeId,
    clientUpdatedAt,
    created_at,
    updated_at,
    deleted_at,
    ...rest
  } = record;

  return {
    ...rest,
    clientUpdatedAt: clientUpdatedAt.toISOString(),
    created_at: created_at?.toISOString() ?? null,
    updated_at: updated_at.toISOString(),
    deleted_at: deleted_at?.toISOString() ?? null,
  };
}

/**
 * A version as a push answers it: a tombstone without the ciphertext it
 * copied, so repeating a large record costs no response bytes.
 */
export function serializePushed(record: RecordType) {
  const serialized = serializeRecord(record);
  if (!record.deleted_at || record.tombstoneKind === "purged") return serialized;
  const { encryptedData: _encryptedData, encryptionNonce: _encryptionNonce, ...meta } = serialized;
  return meta;
}
