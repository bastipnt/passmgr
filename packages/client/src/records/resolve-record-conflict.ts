import type { RecordData } from "@repo/schema";
import type { LocalRecordVersion, RecordCiphertext, RecordConflict } from "@repo/store";
import { decryptRecord } from "../util/decrypt-record";
import { encryptRecord } from "../util/encrypt-record";
import { type MergeVersion, mergeRecord, sameRecordData } from "./merge-record";

/**
 * Null when the local head already is the merge; throws when a version doesn't open, which leaves
 * the local edit on top. Edit times are clamped to server times, which bounds clock skew only: ADR 0001 D5.
 */
export function resolveRecordConflict({
  base,
  local,
  remote,
  receivedAt,
}: RecordConflict): RecordCiphertext | null {
  const localChain = local.map((row) => mergeVersion(row, receivedAt));
  const remoteChain = remote.map((row) => mergeVersion(row, row.created_at ?? undefined));
  const merged = mergeRecord(decryptData(base), localChain, remoteChain);

  const localHead = localChain.at(-1)!;
  const remoteHead = remoteChain.at(-1)!;
  if (merged.deleted) return null;
  if (!localHead.deleted && sameRecordData(merged.data, localHead.data)) return null;

  const { recordId, vaultId } = base;
  return {
    recordId,
    vaultId,
    ...encryptRecord(merged.data, { recordId, vaultId }),
    clientUpdatedAt: latest(localHead.editedAt, remoteHead.editedAt),
  };
}

function mergeVersion(row: LocalRecordVersion, notAfter: string | undefined): MergeVersion {
  return {
    data: decryptData(row),
    editedAt:
      notAfter === undefined ? row.clientUpdatedAt : earliest(row.clientUpdatedAt, notAfter),
    deleted: row.deleted_at != null,
  };
}

function decryptData(row: LocalRecordVersion): RecordData {
  // Main thread on purpose: a conflict is a handful of rows, and a worker
  // round trip per version would only keep the applySync transaction open longer.
  const { schemaVersion: _schemaVersion, ...data } = decryptRecord(row);
  return data as RecordData;
}

function earliest(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function latest(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}
