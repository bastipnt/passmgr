import type { ExportData, ExportEnvelope } from "@repo/schema";
import { useRef, useState } from "react";
import { openExportEnvelope, readExportFile } from "../export/export-file";
import { MAX_IMPORT_FILE_BYTES } from "../export/import-export";
import type { ForeignImport } from "../import/foreign-import";
import {
  type ImportFileContents,
  openKeePassDatabase,
  readImportFile,
} from "../import/read-import-file";
import { type ImportError, readFileError } from "./use-import";

/** A picked file: a web `File`, or anything else with a name, a size and its bytes. */
export type PickedImportFile = {
  name: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type OpenedImportFile =
  | { kind: "backup"; data: ExportData; encrypted: boolean }
  | { kind: "foreign"; foreign: ForeignImport };

/** A picked file that opens only with a password: an encrypted backup or a KeePass database. */
export type LockedImportFile = "backup" | "kdbx";

type Locked = { kind: "backup"; envelope: ExportEnvelope } | { kind: "kdbx"; file: Uint8Array };

/**
 * Pick an import file and open it: one of this app's exports (ADR 0001 D12),
 * and with `foreign`, another password manager's (`readImportFile`). A plain
 * file opens on `pick`; an encrypted backup (its backup password) or a KeePass
 * database (password, optional key file) on `open`.
 */
export function useOpenImportFile(
  onOpened: (opened: OpenedImportFile) => void,
  { foreign = false }: { foreign?: boolean } = {},
) {
  const [file, setFile] = useState<{ name: string; size: number }>();
  const [locked, setLocked] = useState<Locked>();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<ImportError>();
  const latestPick = useRef(0);

  async function pick(picked: PickedImportFile) {
    const pickId = ++latestPick.current;
    setError(undefined);
    setLocked(undefined);
    setFile({ name: picked.name, size: picked.size });
    if (picked.size > MAX_IMPORT_FILE_BYTES) {
      setError("too_large");
      return;
    }
    try {
      const bytes = new Uint8Array(await picked.arrayBuffer());
      // A file picked while this one was still being read replaces it.
      if (pickId !== latestPick.current) return;
      const read: ImportFileContents = foreign
        ? readImportFile(bytes)
        : { kind: "backup", contents: readExportFile(new TextDecoder().decode(bytes)) };
      if (read.kind === "foreign") onOpened(read);
      else if (read.kind === "kdbx") setLocked(read);
      else if (read.contents.encrypted)
        setLocked({ kind: "backup", envelope: read.contents.envelope });
      else onOpened({ kind: "backup", data: read.contents.data, encrypted: false });
    } catch (e) {
      if (pickId === latestPick.current) setError(readFileError(e));
    }
  }

  async function open(password: string, keyFile?: Uint8Array) {
    if (!locked) return;
    const pickId = latestPick.current;
    setError(undefined);
    setOpening(true);
    try {
      const opened: OpenedImportFile =
        locked.kind === "kdbx"
          ? {
              kind: "foreign",
              foreign: await openKeePassDatabase(locked.file, { password, keyFile }),
            }
          : {
              kind: "backup",
              data: await openExportEnvelope(locked.envelope, password),
              encrypted: true,
            };
      if (pickId === latestPick.current) onOpened(opened);
    } catch (e) {
      if (pickId !== latestPick.current) return;
      const reason = readFileError(e);
      if (reason === "failed") console.error("Opening the import file failed", e);
      setError(reason);
    } finally {
      setOpening(false);
    }
  }

  return {
    file,
    locked: locked?.kind as LockedImportFile | undefined,
    opening,
    error,
    pick,
    open,
  };
}
