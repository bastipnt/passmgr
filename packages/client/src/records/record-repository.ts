import type { EncryptedRecordSchema, RecordData } from "@repo/schema";
import {
  type LocalRecordChange,
  type LocalRecordVersion,
  type RecordHead,
  secretsStore,
  type Vault,
} from "@repo/store";
import type { ImportEntry } from "../export/import-export";
import { encryptRecord } from "../util/encrypt-record";

type RecordRef = { recordId: string; vaultId: string };

/**
 * Local-first record access (ADR 0001 D1): reads and writes go to the device's
 * vault only. Every write is a new `pending` version plus its outbox entry, in
 * one transaction; the sync engine pushes it whenever there is a server.
 * Rows come back encrypted; decryption stays with the callers' worker.
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
      { kind: "create", ...this.encrypt(data, { recordId, vaultId }) },
    ]);
    return created!;
  }

  /** `data` as the next version of the record, in the vault it lives in. */
  async update(record: RecordRef, data: RecordData): Promise<EncryptedRecordSchema> {
    const [updated] = await this.write([{ kind: "update", ...this.encrypt(data, record) }]);
    return updated!;
  }

  /** Tombstone the record; its history stays. */
  async delete(recordId: string): Promise<void> {
    await this.write([{ kind: "delete", recordId, clientUpdatedAt: now() }]);
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
      { kind: "create", ...this.encrypt(data, { recordId, vaultId: targetVaultId }) },
      { kind: "delete", recordId: record.recordId, clientUpdatedAt: now() },
    ]);
    return moved!;
  }

  /** Records from an export (`importExportData`), encrypted and written in one transaction. */
  async writeImport(entries: readonly ImportEntry[]): Promise<EncryptedRecordSchema[]> {
    if (entries.length === 0) return [];
    return await this.write(
      entries.map(({ kind, data, ...ref }) => ({ kind, ...this.encrypt(data, ref) })),
    );
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
