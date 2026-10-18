import type { ExportData } from "@repo/schema";
import { useState } from "react";
import { InvalidExportFileError, WrongExportPasswordError } from "../export/export-file";
import {
  type ImportOptions,
  type ImportResult,
  ImportStoppedError,
  importExportData,
} from "../export/import-export";
import {
  type UnsupportedFileReason,
  UnsupportedImportFileError,
  WrongKdbxKeyError,
} from "../import/read-import-file";
import { requireActive, useStore } from "../providers/StoreProvider";
import { useReloadRecords } from "./use-records";

/**
 * - `invalid_file`: in this app's export format, but not one it reads (broken, or a newer version)
 * - `too_large`: over `MAX_IMPORT_FILE_BYTES`, not read
 * - `wrong_password`: the backup password doesn't open the file
 * - `wrong_kdbx_key`: the password or key file doesn't open the KeePass database
 * - `failed`: writing the records failed (batches before the failure stay written)
 * - the rest (`UnsupportedFileReason`): another app's export this import can't read
 */
export type ImportError =
  | "invalid_file"
  | "too_large"
  | "wrong_password"
  | "wrong_kdbx_key"
  | "failed"
  | UnsupportedFileReason;

/** User-facing text for each import error (web + mobile). */
export const IMPORT_ERROR_MESSAGES: Record<ImportError, string> = {
  invalid_file: "This file isn't a backup or export of this app.",
  too_large: "This file is too large to import.",
  wrong_password: "That backup password doesn't open this file.",
  wrong_kdbx_key: "That password or key file doesn't open this KeePass database.",
  failed: "The import failed. Records imported before the error were kept.",
  unsupported_format:
    "This app can't import this file. It reads its own backups, Chrome / Edge, Firefox and Safari CSV, Bitwarden JSON, 1Password 1PUX, KeePass databases and KeePass XML exports.",
  unreadable:
    "This export couldn't be read. It may be damaged, or from a newer version of that app.",
  bitwarden_encrypted:
    "This Bitwarden export is encrypted. Export your vault again as “.json”, not “.json (Encrypted)”.",
  bitwarden_csv: "Bitwarden CSV can't be imported yet. Export your vault as “.json” instead.",
  onepassword_csv: "1Password CSV can't be imported yet. Export your vault as 1PUX instead.",
  kdbx_unsupported:
    "This KeePass database is in a format this app can't read (KeePass 1.x, or Twofish encryption). In KeePass, use File → Export → KeePass XML.",
  own_csv: "This app's CSV export can't be imported. Use a backup or a JSON export.",
};

/** The error for a failure while reading or opening a file; `failed` for anything unexpected. */
export function readFileError(error: unknown): ImportError {
  if (error instanceof InvalidExportFileError) return "invalid_file";
  if (error instanceof WrongExportPasswordError) return "wrong_password";
  if (error instanceof WrongKdbxKeyError) return "wrong_kdbx_key";
  if (error instanceof UnsupportedImportFileError) return error.reason;
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
  const [stopped, setStopped] = useState<{ written: number; total: number }>();

  async function importData(
    data: ExportData,
    options: ImportOptions,
  ): Promise<ImportResult | null> {
    setImportError(undefined);
    setStopped(undefined);
    setBusy(true);
    try {
      return await importExportData(requireActive(store).records, data, options);
    } catch (error) {
      console.error("Import failed", error);
      setImportError("failed");
      if (error instanceof ImportStoppedError) {
        setStopped({ written: error.written, total: error.total });
      }
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
    stopped,
    clearImportError: () => setImportError(undefined),
  };
}
