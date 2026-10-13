import { EXPORT_FORMAT } from "@repo/schema";
import { type ExportFileContents, readExportFile } from "../export/export-file";
import { importBitwarden, isBitwardenExport } from "./bitwarden";
import { browserCsvSource, importBrowserCsv } from "./browser-csv";
import { parseCsv } from "./csv";
import type { ForeignImport } from "./foreign-import";
import { importKeePassXml, isKeePassXml, type ParseXml } from "./keepass";
import { importOnePassword, readOnePasswordExport } from "./onepassword";

/**
 * Files the import recognises but can't read:
 * - `unsupported_format`: none of the formats below
 * - `unreadable`: a known format, but broken
 * - the rest: a known export to make again in a format that is supported
 */
export type UnsupportedFileReason =
  | "unsupported_format"
  | "unreadable"
  | "bitwarden_encrypted"
  | "bitwarden_csv"
  | "onepassword_csv"
  | "kdbx"
  | "own_csv";

export class UnsupportedImportFileError extends Error {
  readonly reason: UnsupportedFileReason;

  constructor(reason: UnsupportedFileReason) {
    super(`UnsupportedImportFileError: ${reason}`);
    this.reason = reason;
  }
}

export type ImportFileContents =
  | { kind: "backup"; contents: ExportFileContents }
  | { kind: "foreign"; foreign: ForeignImport };

/** For a file picker; the format itself is told by content, not by name. */
export const IMPORT_FILE_ACCEPT = ".json,.csv,.xml,.1pux,.kdbx";

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const KDBX_MAGIC = [0x03, 0xd9, 0xa2, 0x9a];

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b);

function foreign(read: () => ForeignImport): ImportFileContents {
  try {
    return { kind: "foreign", foreign: read() };
  } catch (error) {
    console.error("Reading the import file failed", error);
    throw new UnsupportedImportFileError("unreadable");
  }
}

function readJson(text: string): ImportFileContents {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new UnsupportedImportFileError("unsupported_format");
  }
  const object = (json ?? {}) as Record<string, unknown>;
  if (object.format === EXPORT_FORMAT) return { kind: "backup", contents: readExportFile(text) };
  if (object.encrypted === true) throw new UnsupportedImportFileError("bitwarden_encrypted");
  if (isBitwardenExport(json)) return foreign(() => importBitwarden(json));
  throw new UnsupportedImportFileError("unsupported_format");
}

function readCsv(text: string): ImportFileContents {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((name) => name.trim().toLowerCase());
  if (header.includes("login_uri")) throw new UnsupportedImportFileError("bitwarden_csv");
  if (header.includes("archived")) throw new UnsupportedImportFileError("onepassword_csv");
  if (header.slice(0, 3).join() === "vault,type,title")
    throw new UnsupportedImportFileError("own_csv");
  const source = browserCsvSource(header);
  if (!source) throw new UnsupportedImportFileError("unsupported_format");
  return foreign(() => importBrowserCsv(rows, source));
}

/**
 * Tell what an import file is, from its content: a backup or JSON export of
 * this app (`readExportFile`), or another password manager's export, already
 * turned into records. `parseXml` reads KeePass XML (`DOMParser` by default).
 */
export function readImportFile(bytes: Uint8Array, parseXml?: ParseXml): ImportFileContents {
  if (startsWith(bytes, ZIP_MAGIC))
    return foreign(() => importOnePassword(readOnePasswordExport(bytes)));
  if (startsWith(bytes, KDBX_MAGIC)) throw new UnsupportedImportFileError("kdbx");

  const text = new TextDecoder().decode(bytes);
  const start = text.trimStart();
  if (start.startsWith("{")) return readJson(text);
  if (start.startsWith("<")) {
    if (!isKeePassXml(start)) throw new UnsupportedImportFileError("unsupported_format");
    return foreign(() => importKeePassXml(text, parseXml));
  }
  return readCsv(text);
}
