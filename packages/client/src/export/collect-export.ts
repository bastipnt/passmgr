import type {
  EncryptedRecordSchema,
  ExportData,
  ExportRecord,
  ExportVault,
  MemberVault,
  RecordPayload,
} from "@repo/schema";
import { secretsStore, type Vault } from "@repo/store";
import { decryptRecordWithWorker } from "../util/decrypt-record";
import { buildExportData } from "./export-file";

export type CollectedExport = {
  data: ExportData;
  /** Records that didn't open (vault key missing, tampered, newer format): not in `data`. */
  skipped: number;
};

function exportVault(vault: MemberVault): ExportVault {
  let name: string;
  try {
    name = secretsStore.decryptVaultMeta(vault).name;
  } catch {
    // Its records won't open either; the id still says which vault they were in.
    name = vault.kind === "personal" ? "Personal" : "Vault";
  }
  return { id: vault.vaultId, name, kind: vault.kind };
}

function exportRecord(row: EncryptedRecordSchema, payload: RecordPayload): ExportRecord {
  const { schemaVersion: _, ...data } = payload;
  return {
    ...data,
    id: row.recordId,
    vaultId: row.vaultId,
    createdAt: row.firstCreatedAt ?? row.created_at ?? null,
    updatedAt: row.clientUpdatedAt,
  };
}

/**
 * Everything the unlocked profile holds, decrypted (ADR 0001 D12): every vault
 * and the current version of every live record, unsynced local edits included.
 * Read from the local database, not from what is on screen, so the export
 * doesn't depend on the record list being loaded.
 */
export async function collectExportData(
  vault: Vault,
  decrypt: (row: EncryptedRecordSchema) => Promise<RecordPayload> = decryptRecordWithWorker,
): Promise<CollectedExport> {
  const [vaults, rows] = await Promise.all([vault.getVaults(), vault.getAllLatest()]);
  const live = rows.filter((row) => !row.deleted_at);
  const results = await Promise.allSettled(live.map(decrypt));

  const records: ExportRecord[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") records.push(exportRecord(live[i]!, result.value));
  });
  records.sort((a, b) => a.title.localeCompare(b.title));

  return {
    data: buildExportData(vaults.map(exportVault), records),
    skipped: live.length - records.length,
  };
}
