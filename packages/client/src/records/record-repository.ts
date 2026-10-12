import type { EncryptedRecordSchema, RecordData } from "@repo/schema";
import {
  type LocalRecordChange,
  type LocalRecordVersion,
  type RecordHead,
  secretsStore,
  type Vault,
} from "@repo/store";
import type { ImportEntry } from "../export/import-export";
import { decryptRecord } from "../util/decrypt-record";
import { encryptRecord } from "../util/encrypt-record";
import { monitoredPassword } from "./password-health";

type RecordRef = { recordId: string; vaultId: string };

/**
 * Local-first record access (ADR 0001 D1): reads and writes go to the device's
 * vault only. Every write is a new `pending` version plus its outbox entry, in
 * one transaction; the sync engine pushes it whenever there is a server.
 * Rows come back encrypted; decryption stays with the callers' worker (an
 * update only opens the stored head, to date a password change).
 */
export class RecordRepository {
  private readonly vault: Vault;
  private readonly onWrite: () => void;

  /** `onWrite` runs after every committed write, e.g. to schedule a sync. */
  constructor(vault: Vault, onWrite: () => void = () => {}) {
    this.vault = vault;
    this.onWrite = onWrite;
  }

  /** The current records of one vault, or of all vaults. */
  async getAll(vaultId?: string): Promise<EncryptedRecordSchema[]> {
    return await this.vault.getAllLatest(vaultId);
  }

  /** The records in the trash (deleted, not moved or purged), as their tombstones. */
  async getDeleted(vaultId?: string): Promise<EncryptedRecordSchema[]> {
    return await this.vault.getDeletedRecords(vaultId);
  }

  /** Every record id on the device, tombstones included. */
  async heads(): Promise<RecordHead[]> {
    return await this.vault.getRecordHeads();
  }

  /** The latest version of a record, a tombstone included. */
  async getById(recordId: string): Promise<EncryptedRecordSchema | undefined> {
    return await this.vault.getByRecordId(recordId);
  }

  /** Every version of a record, newest first, unsynced ones included. */
  async history(recordId: string): Promise<LocalRecordVersion[]> {
    return await this.vault.getRecordHistory(recordId);
  }

  /** A new record, in the personal vault unless `vaultId` is given. */
  async create(
    data: RecordData,
    vaultId = secretsStore.defaultVaultId,
  ): Promise<EncryptedRecordSchema> {
    if (!vaultId) throw new Error("Vault is locked");
    const recordId = crypto.randomUUID();
    const [created] = await this.write([
      { kind: "create", ...this.encrypt(stampNewPassword(data), { recordId, vaultId }) },
    ]);
    return created!;
  }

  /** `data` as the next version of the record, in the vault it lives in. */
  async update(record: RecordRef, data: RecordData): Promise<EncryptedRecordSchema> {
    const head = await this.vault.getByRecordId(record.recordId);
    const stamped = stampChangedPassword(data, head && decryptHead(head), now());
    const [updated] = await this.write([{ kind: "update", ...this.encrypt(stamped, record) }]);
    return updated!;
  }

  /** Tombstone the record (it goes to the trash); its history stays. */
  async delete(recordId: string): Promise<void> {
    await this.write([{ kind: "delete", recordId, clientUpdatedAt: now() }]);
  }

  /**
   * Take a record out of the trash: `data` (its tombstone's content) as its
   * next version, encrypted under the vault's current key.
   */
  async restore(record: RecordRef, data: RecordData): Promise<EncryptedRecordSchema> {
    return await this.update(record, data);
  }

  /** Delete records for good, with their history, here and on the server (`Vault.purgeRecords`). */
  async purge(recordIds: readonly string[]): Promise<void> {
    if (recordIds.length === 0) return;
    await this.vault.purgeRecords(recordIds);
    this.onWrite();
  }

  /**
   * Move a record to another vault (ADR 0001 D6): re-encrypted under the target
   * vault's key as a new record (new id), the source tombstoned with its
   * history, so the history never reaches the target vault's members.
   */
  async move(
    record: RecordRef,
    data: RecordData,
    targetVaultId: string,
  ): Promise<EncryptedRecordSchema> {
    if (targetVaultId === record.vaultId) throw new Error("The record is already in this vault");
    const recordId = crypto.randomUUID();
    const [moved] = await this.write([
      {
        kind: "create",
        ...this.encrypt(stampNewPassword(data), { recordId, vaultId: targetVaultId }),
      },
      { kind: "delete", recordId: record.recordId, clientUpdatedAt: now(), moved: true },
    ]);
    return moved!;
  }

  /**
   * Records from an export (`importExportData`), encrypted and written in one transaction.
   * A password keeps the date its backup gives it; an overwrite that leaves the password as
   * it is keeps the stored date.
   */
  async writeImport(entries: readonly ImportEntry[]): Promise<EncryptedRecordSchema[]> {
    if (entries.length === 0) return [];
    const changes: LocalRecordChange[] = [];
    for (const { kind, data, ...ref } of entries) {
      const head = kind === "update" ? await this.vault.getByRecordId(ref.recordId) : undefined;
      const stamped = head
        ? stampChangedPassword(data, decryptHead(head), (data as PasswordStamp).passwordChangedAt)
        : data;
      changes.push({ kind, ...this.encrypt(stamped, ref) });
    }
    return await this.write(changes);
  }

  private encrypt(data: RecordData, ref: RecordRef) {
    return { ...ref, ...encryptRecord(data, ref), clientUpdatedAt: now() };
  }

  private async write(changes: LocalRecordChange[]): Promise<EncryptedRecordSchema[]> {
    const written = await this.vault.writeLocalChanges(changes);
    this.onWrite();
    return written;
  }
}

function now() {
  return new Date().toISOString();
}

type PasswordStamp = { passwordChangedAt?: string };

function withPasswordChangedAt(data: RecordData, changedAt: string | undefined): RecordData {
  const { passwordChangedAt: _previous, ...rest } = data as RecordData & PasswordStamp;
  return (changedAt ? { ...rest, passwordChangedAt: changedAt } : rest) as RecordData;
}

/** A new record (or a moved one, which brings its date along): its password is new now. */
function stampNewPassword(data: RecordData): RecordData {
  if (!monitoredPassword(data)) return withPasswordChangedAt(data, undefined);
  return withPasswordChangedAt(data, (data as PasswordStamp).passwordChangedAt ?? now());
}

/**
 * The next version keeps the stored date while the password stays (an older copy's date
 * would rewind it); a changed password takes `changedAt`.
 */
function stampChangedPassword(
  data: RecordData,
  previous: RecordData | undefined,
  changedAt: string | undefined,
): RecordData {
  const password = monitoredPassword(data);
  if (!password) return withPasswordChangedAt(data, undefined);
  if (!previous || monitoredPassword(previous) !== password) {
    return withPasswordChangedAt(data, changedAt);
  }
  const kept =
    (previous as PasswordStamp).passwordChangedAt ?? (data as PasswordStamp).passwordChangedAt;
  return withPasswordChangedAt(data, kept);
}

/** A head that doesn't open (or is in an unknown format) counts as a changed password. */
function decryptHead(row: EncryptedRecordSchema): RecordData | undefined {
  try {
    return decryptRecord(row);
  } catch {
    return undefined;
  }
}
