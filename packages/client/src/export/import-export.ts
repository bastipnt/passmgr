import type {
  EncryptedRecordSchema,
  ExportData,
  ExportRecord,
  ExportVault,
  MemberVault,
  RecordData,
  RecordPayload,
} from "@repo/schema";
import { monitoredPassword } from "../records/password-health";
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
   * A record that gets a new id remembers the file's id (`importedFrom`), so importing
   * the file again finds it (`duplicates`) instead of adding it a second time. For
   * backups; another manager's export has fresh ids on every read, nothing to find.
   */
  trackOrigin?: boolean;
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

/** A batch failed: `written` of `total` records were written before it, and stay. */
export class ImportStoppedError extends Error {
  readonly written: number;
  readonly total: number;

  constructor(written: number, total: number, cause: unknown) {
    super(`Import stopped after ${written} of ${total} records`, { cause });
    this.written = written;
    this.total = total;
  }
}

/** What the device holds under a record id: its vault, and whether it's a tombstone. */
type LocalHead = { vaultId: string; deleted: boolean };

/** A record on the device that an import created: the file's record id → where it lives now. */
type ImportedHead = LocalHead & { recordId: string };

/** Records per transaction: a large file doesn't hold the database in one long write. */
export const IMPORT_BATCH_SIZE = 100;

/** Larger files aren't read: a backup of even a big vault is a few MB. */
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;

/**
 * The record's content, without where it lived in the file. A password the file doesn't
 * date (a backup from before `passwordChangedAt`) is as old as the record, not the import.
 */
export function importRecordData(record: ExportRecord): RecordData {
  const {
    id: _id,
    vaultId: _vaultId,
    createdAt,
    updatedAt: _updatedAt,
    schemaVersion: _schemaVersion,
    ...data
  } = record as ExportRecord & { schemaVersion?: unknown; passwordChangedAt?: string };
  if (monitoredPassword(data as RecordData) && !data.passwordChangedAt && createdAt) {
    return { ...data, passwordChangedAt: createdAt } as RecordData;
  }
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
 * the vault it was exported from: elsewhere it is a new record (the AAD binds
 * the ciphertext to vault and record, and the id may still be taken in its old
 * vault on the server). An id the device holds in another vault always gets a
 * new one. A record found again by its id, or by the id an earlier import
 * remembered (`imported`), is a duplicate.
 */
export function planImport(
  data: ExportData,
  existing: ReadonlyMap<string, LocalHead>,
  options: ImportOptions,
  imported: ReadonlyMap<string, ImportedHead> = new Map(),
): ImportPlan {
  const heads = new Map(existing);
  const seen = new Map(imported);
  const entries: ImportEntry[] = [];
  let skipped = 0;

  for (const record of data.records) {
    const vaultId = options.vaultMap[record.vaultId] ?? options.fallbackVaultId;
    const recordData = importRecordData(record);
    const origin = originId(record);
    const sameId = heads.get(record.id);
    const originHead = heads.get(origin);
    const found = (head: LocalHead | undefined, recordId: string) =>
      head?.vaultId === vaultId ? { ...head, recordId } : undefined;
    const match =
      found(sameId, record.id) ??
      found(originHead, origin) ??
      (seen.get(origin)?.vaultId === vaultId ? seen.get(origin) : undefined);
    const withOrigin = (recordId: string): RecordData =>
      options.trackOrigin && recordId !== origin
        ? ({ ...recordData, importedFrom: { recordId: origin } } as RecordData)
        : recordData;
    let entry: ImportEntry | undefined;

    if (match && options.duplicates === "overwrite") {
      const { recordId } = match;
      entry = { kind: "update", recordId, vaultId, data: withOrigin(recordId) };
    } else if (match && options.duplicates === "skip") {
      skipped++;
    } else {
      const recordId = !sameId && vaultId === record.vaultId ? record.id : crypto.randomUUID();
      entry = { kind: "create", recordId, vaultId, data: withOrigin(recordId) };
    }

    if (entry) {
      entries.push(entry);
      // A file holding the same record twice: the second one is a duplicate of the first.
      const head = { vaultId, deleted: false };
      heads.set(entry.recordId, head);
      seen.set(origin, { ...head, recordId: entry.recordId });
    }
  }
  return { entries, skipped };
}

/** The id a record had where it was first written: its own, or the one an import remembered. */
function originId(record: ExportRecord): string {
  return (record as { importedFrom?: { recordId: string } }).importedFrom?.recordId ?? record.id;
}

/**
 * The records an earlier import created in `vaultIds`, by the file id they came from. Decrypted
 * here, in memory: the origin is only in the ciphertext. A record that doesn't open is left out.
 */
async function importedHeads(
  records: RecordRepository,
  vaultIds: ReadonlySet<string>,
  decrypt: (row: EncryptedRecordSchema) => Promise<RecordPayload>,
): Promise<Map<string, ImportedHead>> {
  const found = new Map<string, ImportedHead>();
  for (const vaultId of vaultIds) {
    const rows = [
      ...(await records.getAll(vaultId)).map((row) => ({ row, deleted: false })),
      ...(await records.getDeleted(vaultId)).map((row) => ({ row, deleted: true })),
    ];
    for (const { row, deleted } of rows) {
      try {
        const { importedFrom } = await decrypt(row);
        if (importedFrom)
          found.set(importedFrom.recordId, { vaultId, deleted, recordId: row.recordId });
      } catch {
        // Counts as no match: the record is imported again.
      }
    }
  }
  return found;
}

// Not content: an older backup without the date, or an import's origin, still matches.
function withoutBookkeeping(data: RecordData): RecordData {
  const {
    passwordChangedAt: _date,
    importedFrom: _origin,
    ...rest
  } = data as RecordData & { passwordChangedAt?: string };
  return rest as RecordData;
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
    return sameContent(withoutBookkeeping(current), withoutBookkeeping(entry.data));
  } catch {
    return false;
  }
}

/** The vaults the file writes to that already hold records: the only places an earlier import can be. */
function targetVaultsWithRecords(
  data: ExportData,
  existing: ReadonlyMap<string, LocalHead>,
  options: ImportOptions,
): Set<string> {
  const occupied = new Set([...existing.values()].map((head) => head.vaultId));
  const targets = new Set(
    data.records.map((r) => options.vaultMap[r.vaultId] ?? options.fallbackVaultId),
  );
  return new Set([...targets].filter((vaultId) => occupied.has(vaultId)));
}

/**
 * Import `data` through `records` (local versions + outbox), `IMPORT_BATCH_SIZE`
 * records per transaction. An overwrite with unchanged content is skipped. A
 * failed batch stops the import (`ImportStoppedError`); the batches before it
 * stay written.
 */
export async function importExportData(
  records: RecordRepository,
  data: ExportData,
  options: ImportOptions,
  decrypt: (row: EncryptedRecordSchema) => Promise<RecordPayload> = decryptRecordWithWorker,
): Promise<ImportResult> {
  const existing = new Map((await records.heads()).map((head) => [head.recordId, head]));
  const imported = options.trackOrigin
    ? await importedHeads(records, targetVaultsWithRecords(data, existing, options), decrypt)
    : undefined;
  const plan = planImport(data, existing, options, imported);
  let skipped = plan.skipped;
  const entries: ImportEntry[] = [];
  for (const entry of plan.entries) {
    const overwritesLive =
      entry.kind === "update" && existing.get(entry.recordId)?.deleted === false;
    if (overwritesLive && (await holdsSameContent(records, entry, decrypt))) skipped++;
    else entries.push(entry);
  }

  for (let i = 0; i < entries.length; i += IMPORT_BATCH_SIZE) {
    try {
      await records.writeImport(entries.slice(i, i + IMPORT_BATCH_SIZE));
    } catch (error) {
      throw new ImportStoppedError(i, entries.length, error);
    }
  }
  const created = entries.filter((e) => e.kind === "create").length;
  return { created, updated: entries.length - created, skipped };
}
