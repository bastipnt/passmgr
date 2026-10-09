import type {
  EncryptedRecordSchema,
  ExportData,
  ExportRecord,
  ExportVault,
  MemberVault,
  RecordData,
  RecordPayload,
} from "@repo/schema";
import type { RecordRepository } from "../records/record-repository";
import { decryptRecordWithWorker } from "../util/decrypt-record";

/*
 * Reading an export back (ADR 0001 D12): into the open profile (Settings →
 * Import) or into a new local vault (restore). Every record is re-encrypted
 * under its target vault's key and written as a local change, so a linked
 * profile pushes it like any other edit.
 */

/**
 * A record whose id is already in the target vault (live or deleted):
 * - `skip`: leave the vault's record as it is (a deleted one stays deleted)
 * - `overwrite`: the file's content as its next version (the history keeps the
 *   old one; a deleted record comes back). Unchanged content writes nothing.
 * - `keep-both`: the file's record as a new record next to it
 */
export type DuplicateStrategy = "skip" | "overwrite" | "keep-both";

export type ImportOptions = {
  /** File vault id → the vault its records go to. Vaults not in the map go to `fallbackVaultId`. */
  vaultMap: Readonly<Record<string, string>>;
  fallbackVaultId: string;
  duplicates: DuplicateStrategy;
  /**
   * Keep the file's record ids in any vault, not only in the one a record was
   * exported from. For a restore into a new vault: importing the file there
   * again then finds every record already in it (`duplicates`), instead of
   * adding it a second time.
   */
  keepIds?: boolean;
};

/** One record to write: a new one, or the next version of one already on the device. */
export type ImportEntry = {
  kind: "create" | "update";
  recordId: string;
  vaultId: string;
  data: RecordData;
};

export type ImportPlan = { entries: ImportEntry[]; skipped: number };

export type ImportResult = { created: number; updated: number; skipped: number };

/** What the device holds under a record id: its vault, and whether it's a tombstone. */
type LocalHead = { vaultId: string; deleted: boolean };

/** Records per transaction: a large file doesn't hold the database in one long write. */
export const IMPORT_BATCH_SIZE = 100;

/** Larger files aren't read: a backup of even a big vault is a few MB. */
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;

/** The record's content, without where it lived in the file. */
export function importRecordData(record: ExportRecord): RecordData {
  const {
    id: _id,
    vaultId: _vaultId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    schemaVersion: _schemaVersion,
    ...data
  } = record as ExportRecord & { schemaVersion?: unknown };
  return data as RecordData;
}

/** The vaults an import can write to: not the ones the user may only read. */
export function writableVaults(vaults: readonly MemberVault[]): MemberVault[] {
  return vaults.filter((vault) => vault.role !== "read");
}

/** Each file vault into the same vault when the user can write to it, else into `fallbackVaultId`. */
export function defaultVaultMap(
  fileVaults: readonly ExportVault[],
  targets: readonly MemberVault[],
  fallbackVaultId: string,
): Record<string, string> {
  const writable = new Set(writableVaults(targets).map((v) => v.vaultId));
  return Object.fromEntries(
    fileVaults.map((v) => [v.id, writable.has(v.id) ? v.id : fallbackVaultId]),
  );
}

/**
 * Decide what each record of the file becomes. A record keeps its id only in
 * the vault it was exported from (or anywhere with `keepIds`): elsewhere it is
 * a new record (the AAD binds the ciphertext to vault and record, and the id
 * may still be taken in its old vault on the server). An id the device holds
 * in another vault always gets a new one.
 */
export function planImport(
  data: ExportData,
  existing: ReadonlyMap<string, LocalHead>,
  options: ImportOptions,
): ImportPlan {
  const heads = new Map(existing);
  const entries: ImportEntry[] = [];
  let skipped = 0;

  for (const record of data.records) {
    const vaultId = options.vaultMap[record.vaultId] ?? options.fallbackVaultId;
    const recordData = importRecordData(record);
    const head = heads.get(record.id);
    let entry: ImportEntry | undefined;

    if (head?.vaultId === vaultId && options.duplicates === "overwrite") {
      entry = { kind: "update", recordId: record.id, vaultId, data: recordData };
    } else if (head?.vaultId === vaultId && options.duplicates === "skip") {
      skipped++;
    } else {
      const keepId = !head && (options.keepIds === true || vaultId === record.vaultId);
      entry = {
        kind: "create",
        recordId: keepId ? record.id : crypto.randomUUID(),
        vaultId,
        data: recordData,
      };
    }

    if (entry) {
      entries.push(entry);
      // A file holding the same id twice: the second one is a duplicate of the first.
      heads.set(entry.recordId, { vaultId, deleted: false });
    }
  }
  return { entries, skipped };
}

/** Same JSON value, object keys in any order. */
function sameContent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const keysB = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return (
    keysA.length === keysB.length &&
    keysA.every((k) =>
      sameContent((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  );
}

/** Whether a live record already holds exactly `data`. One that doesn't open counts as changed. */
async function holdsSameContent(
  records: RecordRepository,
  entry: ImportEntry,
  decrypt: (row: EncryptedRecordSchema) => Promise<RecordPayload>,
): Promise<boolean> {
  const row = await records.getById(entry.recordId);
  if (!row || row.deleted_at) return false;
  try {
    const { schemaVersion: _, ...current } = await decrypt(row);
    return sameContent(current, entry.data);
  } catch {
    return false;
  }
}

/**
 * Import `data` through `records` (local versions + outbox), `IMPORT_BATCH_SIZE`
 * records per transaction. An overwrite with unchanged content is skipped. A
 * failed batch stops the import; the batches before it stay written.
 */
export async function importExportData(
  records: RecordRepository,
  data: ExportData,
  options: ImportOptions,
  decrypt: (row: EncryptedRecordSchema) => Promise<RecordPayload> = decryptRecordWithWorker,
): Promise<ImportResult> {
  const existing = new Map((await records.heads()).map((head) => [head.recordId, head]));
  const plan = planImport(data, existing, options);
  let skipped = plan.skipped;
  const entries: ImportEntry[] = [];
  for (const entry of plan.entries) {
    const overwritesLive =
      entry.kind === "update" && existing.get(entry.recordId)?.deleted === false;
    if (overwritesLive && (await holdsSameContent(records, entry, decrypt))) skipped++;
    else entries.push(entry);
  }

  for (let i = 0; i < entries.length; i += IMPORT_BATCH_SIZE) {
    await records.writeImport(entries.slice(i, i + IMPORT_BATCH_SIZE));
  }
  const created = entries.filter((e) => e.kind === "create").length;
  return { created, updated: entries.length - created, skipped };
}
