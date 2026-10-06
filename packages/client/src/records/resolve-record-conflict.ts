import type { EncryptedRecordSchema, RecordData } from "@repo/schema";
import type { RecordCiphertext, RecordConflict } from "@repo/store";
import { decryptRecord } from "../util/decrypt-record";
import { encryptRecord } from "../util/encrypt-record";
import { type MergeVersion, mergeRecord, sameRecordData } from "./merge-record";

/**
 * Merge a record edited here and on the server (ADR 0001 D5): decrypt all
 * three sides, merge field by field, and encrypt the merge as the record's
 * next version. Null when the local head already is the merge, so nothing
 * needs appending. Needs the vault keys (sync only runs unlocked); throws
 * when a version doesn't open, which leaves the local edit on top.
 *
 * Edit times are device clocks, clamped so no edit counts as later than the
 * server saw it: a local edit not after the pull (`receivedAt`), a server
 * version not after its arrival (`created_at`). That only catches a clock
 * running past those; a clock off by less, or running behind, can still win
 * or lose a field it shouldn't. Nothing short of a server timestamp per field
 * edit would fix that.
 *
 * The merge's own time is the later of the two heads, so in a later merge
 * every field taken from the server side counts as edited then, a little
 * later than it may have been (it only matters when another conflict hits
 * before the merge is pushed).
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

function mergeVersion(row: EncryptedRecordSchema, notAfter: string | undefined): MergeVersion {
  return {
    data: decryptData(row),
    editedAt:
      notAfter === undefined ? row.clientUpdatedAt : earliest(row.clientUpdatedAt, notAfter),
    deleted: row.deleted_at != null,
  };
}

function decryptData(row: EncryptedRecordSchema): RecordData {
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
