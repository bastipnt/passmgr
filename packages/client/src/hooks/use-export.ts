import { useState } from "react";
import { opensPasswordWrap } from "../account/change-password";
import { collectExportData } from "../export/collect-export";
import { type ExportFile, type ExportFormat, exportFile } from "../export/export-file";
import { useStore } from "../providers/StoreProvider";

/**
 * - `wrong_password`: the master password (asked for every export) is wrong
 * - `failed`: the vault couldn't be read or the file couldn't be built
 */
export type ExportError = "wrong_password" | "failed";

/** User-facing text for each export error (web + mobile). */
export const EXPORT_ERROR_MESSAGES: Record<ExportError, string> = {
  wrong_password: "That's not your master password.",
  failed: "The export couldn't be created. Please try again.",
};

/** Every export re-checks the master password; an encrypted one also takes its own password. */
export type ExportRequest = { masterPassword: string } & (
  | { format: "encrypted"; exportPassword: string }
  | { format: Exclude<ExportFormat, "encrypted"> }
);

export type ExportResult = ExportFile & {
  format: ExportFormat;
  /** The profile exported, for `markSaved`. */
  profileId: string;
  /** Records left out because they didn't open. */
  skipped: number;
};

/**
 * Export the unlocked profile (ADR 0001 D12), in `local` mode as well as
 * online: an encrypted backup under a password chosen for the file, or plain
 * JSON / CSV. Every export asks for the master password again: whoever sits
 * at an unlocked session would otherwise take the whole vault in one click,
 * an encrypted backup included (they pick its password). Saving the file is the caller's
 * (platform) job; it calls `markSaved` once the file is saved.
 *
 * An encrypted export counts as a backup once saved: `markSaved` moves the
 * profile's `lastExportAt`, which puts the backup reminder off. A plain one
 * doesn't.
 */
export function useExport() {
  const { current, markExported } = useStore();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<ExportError>();

  async function createExport(request: ExportRequest): Promise<ExportResult | null> {
    const active = current();
    if (!active) return null;
    setExportError(undefined);
    setExporting(true);
    try {
      const material = active.accountKeyMaterial;
      if (!material) throw new Error("No password wrap to check the master password against");
      if (!(await opensPasswordWrap(request.masterPassword, material))) {
        setExportError("wrong_password");
        return null;
      }
      const { data, skipped } = await collectExportData(active.vault);
      const file =
        request.format === "encrypted"
          ? await exportFile(data, "encrypted", request.exportPassword)
          : await exportFile(data, request.format);
      return {
        ...file,
        format: request.format,
        profileId: active.entry.profileId,
        skipped,
      };
    } catch (error) {
      console.error("Export failed", error);
      setExportError("failed");
      return null;
    } finally {
      setExporting(false);
    }
  }

  /**
   * The file was saved: an encrypted one is now the profile's latest backup.
   * Never throws: the file is saved either way, only the reminder date lags.
   */
  async function markSaved(result: ExportResult): Promise<void> {
    if (result.format !== "encrypted") return;
    try {
      await markExported(result.profileId);
    } catch (error) {
      console.error("Could not record the backup date", error);
    }
  }

  return {
    createExport,
    markSaved,
    exporting,
    exportError,
    clearExportError: () => setExportError(undefined),
  };
}
