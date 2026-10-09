import type { ExportData } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { useRef, useState } from "react";
import { type ImportResult, importExportData } from "../export/import-export";
import { requireActive, useStore } from "../providers/StoreProvider";
import { useCreateLocalVault } from "./use-create-local-vault";
import { useReloadRecords } from "./use-records";

/**
 * - `failed` / `unlock_failed`: as in `useCreateLocalVault` (nothing created / created but not opened)
 * - `import_failed`: the vault is there and open, but writing the records failed
 *   (batches before the failure stay written); importing the file again finishes it
 */
export type RestoreError = "failed" | "unlock_failed" | "import_failed";

/**
 * Restore a backup into a new local vault (ADR 0001 D12): for a lost or
 * cleared browser, or a new device. Read the file first (`readExportFile`,
 * `openExportEnvelope`), then, like `useCreateLocalVault`:
 *
 * 1. `restore(data, password, name)` creates the vault under a new master
 *    password and resolves its recovery key, to be shown once.
 * 2. `finishRestore()` unlocks it and imports every record of the file into
 *    its personal vault (a local vault has no other), keeping the record ids.
 */
export function useRestoreBackup() {
  const { createLocalVault, finishLocalVault, createError } = useCreateLocalVault();
  const store = useStore();
  const reload = useReloadRecords();
  const pending = useRef<ExportData | undefined>(undefined);
  const [importFailed, setImportFailed] = useState(false);

  async function restore(
    data: ExportData,
    password: string,
    name?: string,
  ): Promise<Uint8Array | undefined> {
    setImportFailed(false);
    const recoveryKey = await createLocalVault(password, name);
    pending.current = recoveryKey ? data : undefined;
    return recoveryKey;
  }

  /** Null when the vault didn't open or the import failed (`restoreError` says which). */
  async function finishRestore(): Promise<ImportResult | null> {
    const data = pending.current;
    pending.current = undefined;
    if (!data || !(await finishLocalVault())) return null;

    try {
      const vaultId = secretsStore.defaultVaultId;
      if (!vaultId) throw new Error("The new vault has no personal vault key");
      return await importExportData(requireActive(store).records, data, {
        vaultMap: {},
        fallbackVaultId: vaultId,
        // The vault is new: nothing to collide with. Kept ids make a second
        // import of the file (after a failure here) skip what is already in.
        duplicates: "skip",
        keepIds: true,
      });
    } catch (error) {
      console.error("Restoring the records failed", error);
      setImportFailed(true);
      return null;
    } finally {
      await reload().catch(() => undefined);
    }
  }

  const restoreError: RestoreError | undefined = importFailed ? "import_failed" : createError;
  return { restore, finishRestore, restoreError };
}
