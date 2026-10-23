import { secretsStore } from "@repo/store";
import { useRef, useState } from "react";
import {
  type ImportOptions,
  type ImportResult,
  ImportStoppedError,
  importExportData,
} from "../export/import-export";
import { requireActive, useStore } from "../providers/StoreProvider";
import { useCreateLocalVault } from "./use-create-local-vault";
import type { OpenedImportFile } from "./use-open-import-file";
import { useReloadRecords } from "./use-records";

/**
 * - `failed` / `unlock_failed`: as in `useCreateLocalVault` (nothing created / created but not opened)
 * - `import_failed`: the vault is there and open, but writing the records failed
 *   (batches before the failure stay written); importing a backup again finishes it,
 *   another app's export again adds those batches a second time
 */
export type RestoreError = "failed" | "unlock_failed" | "import_failed";

/** `stopped`: the import failed after writing some of the records. */
export type RestoreOutcome =
  | { ok: true; result: ImportResult }
  | { ok: false; stopped?: { written: number; total: number } };

function importOptions(source: OpenedImportFile, vaultId: string): ImportOptions {
  if (source.kind === "foreign") {
    return {
      vaultMap: { [source.foreign.vaultId]: vaultId },
      fallbackVaultId: vaultId,
      duplicates: "keep-both",
    };
  }
  return {
    vaultMap: {},
    fallbackVaultId: vaultId,
    // The vault is new: nothing to collide with. Kept ids make a second
    // import of the file (after a failure here) skip what is already in.
    duplicates: "skip",
    keepIds: true,
  };
}

/**
 * Start a new local vault from a file: restore a backup (ADR 0001 D12), for a
 * lost or cleared browser or a new device, or import another password
 * manager's export. Open the file first (`useOpenImportFile`), then, like
 * `useCreateLocalVault`:
 *
 * 1. `restore(source, password, name)` creates the vault under a new master
 *    password and resolves its recovery key, to be shown once.
 * 2. `finishRestore()` unlocks it and imports every record of the file into
 *    its personal vault (a local vault has no other): a backup's keep their
 *    ids, another app's are all new.
 */
export function useRestoreBackup() {
  const { createLocalVault, finishLocalVault, createError } = useCreateLocalVault();
  const store = useStore();
  const reload = useReloadRecords();
  const pending = useRef<OpenedImportFile | undefined>(undefined);
  const [importFailed, setImportFailed] = useState(false);

  async function restore(
    source: OpenedImportFile,
    password: string,
    name?: string,
  ): Promise<Uint8Array | undefined> {
    setImportFailed(false);
    const recoveryKey = await createLocalVault(password, name);
    pending.current = recoveryKey ? source : undefined;
    return recoveryKey;
  }

  /** Not `ok` when the vault didn't open or the import failed (`restoreError` says which). */
  async function finishRestore(): Promise<RestoreOutcome> {
    const source = pending.current;
    pending.current = undefined;
    if (!source || !(await finishLocalVault())) return { ok: false };

    try {
      const vaultId = secretsStore.defaultVaultId;
      if (!vaultId) throw new Error("The new vault has no personal vault key");
      const data = source.kind === "foreign" ? source.foreign.data : source.data;
      const result = await importExportData(
        requireActive(store).records,
        data,
        importOptions(source, vaultId),
      );
      return { ok: true, result };
    } catch (error) {
      console.error("Restoring the records failed", error);
      setImportFailed(true);
      return error instanceof ImportStoppedError
        ? { ok: false, stopped: { written: error.written, total: error.total } }
        : { ok: false };
    } finally {
      await reload().catch(() => undefined);
    }
  }

  const restoreError: RestoreError | undefined = importFailed ? "import_failed" : createError;
  return { restore, finishRestore, restoreError };
}
