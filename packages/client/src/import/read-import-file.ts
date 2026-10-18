import {
  isKdbx,
  type KdbxCredentials,
  KdbxInvalidKeyError,
  KdbxUnsupportedError,
  openKdbx,
} from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
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
  | "kdbx_unsupported"
  | "own_csv";

export class UnsupportedImportFileError extends Error {
  readonly reason: UnsupportedFileReason;

  constructor(reason: UnsupportedFileReason) {
    super(`UnsupportedImportFileError: ${reason}`);
    this.reason = reason;
  }
}

/** The password or key file doesn't open the KeePass database. */
export class WrongKdbxKeyError extends Error {
  constructor() {
    super("WrongKdbxKeyError");
  }
}

export type ImportFileContents =
  | { kind: "backup"; contents: ExportFileContents }
  | { kind: "foreign"; foreign: ForeignImport }
  /** A KeePass database: open it with `openKeePassDatabase`. */
  | { kind: "kdbx"; file: Uint8Array };

/** For a file picker; the format itself is told by content, not by name. */
export const IMPORT_FILE_ACCEPT = ".json,.csv,.xml,.1pux,.kdbx";

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
/** KeePass's first signature, shared by KeePass 1.x `.kdb` files. */
const KEEPASS_MAGIC = [0x03, 0xd9, 0xa2, 0x9a];

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b);

function readForeign(read: () => ForeignImport): ForeignImport {
  try {
    return read();
  } catch (error) {
    console.error("Reading the import file failed", error);
    throw new UnsupportedImportFileError("unreadable");
  }
}

const foreign = (read: () => ForeignImport): ImportFileContents => ({
  kind: "foreign",
  foreign: readForeign(read),
});

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
  if (isKdbx(bytes)) return { kind: "kdbx", file: bytes };
  if (startsWith(bytes, KEEPASS_MAGIC)) throw new UnsupportedImportFileError("kdbx_unsupported");

  const text = new TextDecoder().decode(bytes);
  const start = text.trimStart();
  if (start.startsWith("{")) return readJson(text);
  if (start.startsWith("<")) {
    if (!isKeePassXml(start)) throw new UnsupportedImportFileError("unsupported_format");
    return foreign(() => importKeePassXml(text, parseXml));
  }
  return readCsv(text);
}

/**
 * Decrypt a KeePass database (KDBX 3.1 / 4) on the device and read it like a
 * KeePass XML export. KeePass tells "no password" from an empty one: with a
 * key file and no password, both are tried.
 */
export async function openKeePassDatabase(
  file: Uint8Array,
  { password, keyFile }: { password: string; keyFile?: Uint8Array },
  parseXml?: ParseXml,
): Promise<ForeignImport> {
  const attempts: KdbxCredentials[] =
    keyFile && !password ? [{ keyFile }, { password, keyFile }] : [{ password, keyFile }];
  for (const credentials of attempts) {
    let xml: string;
    try {
      xml = await openKdbx(file, credentials, (key, salt, params) =>
        argon2WorkerService.derive(key, salt, params),
      );
    } catch (error) {
      if (error instanceof KdbxInvalidKeyError) continue;
      if (error instanceof KdbxUnsupportedError) {
        throw new UnsupportedImportFileError("kdbx_unsupported");
      }
      console.error("Opening the KeePass database failed", error);
      throw new UnsupportedImportFileError("unreadable");
    }
    return { ...readForeign(() => importKeePassXml(xml, parseXml)), fileEncrypted: true };
  }
  throw new WrongKdbxKeyError();
}
