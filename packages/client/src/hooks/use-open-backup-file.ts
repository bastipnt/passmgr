import type { ExportData, ExportEnvelope } from "@repo/schema";
import { useRef, useState } from "react";
import { openExportEnvelope, readExportFile } from "../export/export-file";
import { MAX_IMPORT_FILE_BYTES } from "../export/import-export";
import { type ImportError, readFileError } from "./use-import";

/** A picked file: a web `File`, or anything else with a name, a size and its text. */
export type BackupFile = { name: string; size: number; text: () => Promise<string> };

export type OpenedBackup = { data: ExportData; encrypted: boolean };

/**
 * Pick one of this app's export files (ADR 0001 D12) and open it: a plain JSON
 * export opens on `pick`, an encrypted backup on `open` with its backup password.
 */
export function useOpenBackupFile(onOpened: (backup: OpenedBackup) => void) {
  const [file, setFile] = useState<{ name: string; size: number }>();
  const [envelope, setEnvelope] = useState<ExportEnvelope>();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<ImportError>();
  const latestPick = useRef(0);

  async function pick(picked: BackupFile) {
    const pickId = ++latestPick.current;
    setError(undefined);
    setEnvelope(undefined);
    setFile({ name: picked.name, size: picked.size });
    if (picked.size > MAX_IMPORT_FILE_BYTES) {
      setError("too_large");
      return;
    }
    try {
      const text = await picked.text();
      // A file picked while this one was still being read replaces it.
      if (pickId !== latestPick.current) return;
      const contents = readExportFile(text);
      if (contents.encrypted) setEnvelope(contents.envelope);
      else onOpened({ data: contents.data, encrypted: false });
    } catch (e) {
      if (pickId === latestPick.current) setError(readFileError(e));
    }
  }

  async function open(password: string) {
    if (!envelope) return;
    const pickId = latestPick.current;
    setError(undefined);
    setOpening(true);
    try {
      const data = await openExportEnvelope(envelope, password);
      if (pickId === latestPick.current) onOpened({ data, encrypted: true });
    } catch (e) {
      if (pickId !== latestPick.current) return;
      const reason = readFileError(e);
      if (reason === "failed") console.error("Opening the backup failed", e);
      setError(reason);
    } finally {
      setOpening(false);
    }
  }

  return { file, encrypted: envelope !== undefined, opening, error, pick, open };
}
