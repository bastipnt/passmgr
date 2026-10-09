import type { ExportData } from "@repo/schema";
import { useState } from "react";
import { InvalidExportFileError, WrongExportPasswordError } from "../export/export-file";
import { type ImportOptions, type ImportResult, importExportData } from "../export/import-export";
import { requireActive, useStore } from "../providers/StoreProvider";
import { useReloadRecords } from "./use-records";

/**
 * - `invalid_file`: not an export of this app (or of a version it doesn't read)
 * - `too_large`: over `MAX_IMPORT_FILE_BYTES`, not read
 * - `wrong_password`: the backup password doesn't open the file
 * - `failed`: writing the records failed (batches before the failure stay written)
 */
export type ImportError = "invalid_file" | "too_large" | "wrong_password" | "failed";

/** User-facing text for each import error (web + mobile). */
export const IMPORT_ERROR_MESSAGES: Record<ImportError, string> = {
  invalid_file: "This file isn't a backup or export of this app.",
  too_large: "This file is too large to be a backup of this app.",
  wrong_password: "That backup password doesn't open this file.",
  failed: "The import failed. Records imported before the error were kept.",
};

/** The error for a failure while reading or opening a file; `failed` for anything unexpected. */
export function readFileError(error: unknown): ImportError {
  if (error instanceof InvalidExportFileError) return "invalid_file";
  if (error instanceof WrongExportPasswordError) return "wrong_password";
  return "failed";
}

/**
 * Import an export (encrypted backup or plain JSON, ADR 0001 D12, read with
 * `readExportFile` / `openExportEnvelope`) into the unlocked profile, into the
 * vaults `options` names. Records are re-read afterwards, a partial import too.
 */
export function useImport() {
  const store = useStore();
  const reload = useReloadRecords();
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState<ImportError>();

  async function importData(
    data: ExportData,
    options: ImportOptions,
  ): Promise<ImportResult | null> {
    setImportError(undefined);
    setBusy(true);
    try {
      return await importExportData(requireActive(store).records, data, options);
    } catch (error) {
      console.error("Import failed", error);
      setImportError("failed");
      return null;
    } finally {
      // Partly written or not: show what is in the vault now.
      await reload().catch(() => undefined);
      setBusy(false);
    }
  }

  return {
    importData,
    busy,
    importError,
    clearImportError: () => setImportError(undefined),
  };
}
