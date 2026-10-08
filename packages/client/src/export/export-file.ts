import {
  exportKdf,
  genSalt,
  getPasswordKekParams,
  openExport,
  sealExport,
  wipe,
} from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import {
  CURRENT_SCHEMA_VERSION,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  type ExportData,
  type ExportEnvelope,
  type ExportKdf,
  type ExportRecord,
  type ExportVault,
  exportDataSchema,
  exportEnvelopeSchema,
} from "@repo/schema";
import { fromBase64 } from "@repo/util";
import { timed } from "../util/perf";

/*
 * Export files (ADR 0001 D12): an encrypted backup, or the same data as plain
 * JSON or CSV for another tool. Building the data is in `collect-export.ts`;
 * this file only turns it into file contents.
 */

export type ExportFormat = "encrypted" | "json" | "csv";

export function buildExportData(
  vaults: ExportVault[],
  records: ExportRecord[],
  now: Date = new Date(),
): ExportData {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    recordSchemaVersion: CURRENT_SCHEMA_VERSION,
    vaults,
    records,
  };
}

export function exportToJson(data: ExportData): string {
  return JSON.stringify(data, null, 2);
}

/** The export key: Argon2id over the export password, in the worker (native: off the JS thread). */
function deriveExportKey(password: string, kdf: ExportKdf): Promise<Uint8Array> {
  return timed(`argon2 export (t:${kdf.t} m:${kdf.m} p:${kdf.p})`, () =>
    argon2WorkerService.derive(password, fromBase64(kdf.salt), kdf),
  );
}

/** An encrypted backup, with the same Argon2 cost as the master password. */
export async function encryptExport(data: ExportData, password: string): Promise<string> {
  const kdf = exportKdf(genSalt(), getPasswordKekParams());
  const key = await deriveExportKey(password, kdf);
  try {
    return JSON.stringify(sealExport(key, kdf, JSON.stringify(data)), null, 2);
  } finally {
    wipe(key);
  }
}

/** The export file isn't one (or of a version this app doesn't read). */
export class InvalidExportFileError extends Error {
  override message = "InvalidExportFileError";
}

/** The password doesn't open the encrypted export (or the file was changed). */
export class WrongExportPasswordError extends Error {
  override message = "WrongExportPasswordError";
}

/** Read an encrypted export back. */
export async function decryptExport(file: string, password: string): Promise<ExportData> {
  let envelope: ExportEnvelope;
  try {
    envelope = exportEnvelopeSchema.parse(JSON.parse(file));
  } catch {
    throw new InvalidExportFileError();
  }
  const key = await deriveExportKey(password, envelope.kdf);
  let json: string;
  try {
    json = openExport(key, envelope);
  } catch {
    throw new WrongExportPasswordError();
  } finally {
    wipe(key);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidExportFileError();
  }
  const result = exportDataSchema.safeParse(parsed);
  if (!result.success) throw new InvalidExportFileError();
  // The records' own fields aren't validated (`exportRecordSchema`): kept as written.
  return result.data as unknown as ExportData;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Fields with a column of their own; the rest of a type's fields go into `fields`. */
const CSV_COLUMNS = [
  "vault",
  "type",
  "title",
  "username",
  "password",
  "websites",
  "totp",
  "note",
  "fields",
  "customFields",
  "tags",
  "favorite",
  "createdAt",
  "updatedAt",
] as const;

const OWN_COLUMN = new Set<string>([
  ...CSV_COLUMNS,
  "id",
  "vaultId",
  "attachments",
  "schemaVersion",
]);

/** RFC 4180: quoted when it holds a comma, quote or line break; quotes doubled. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Free-text columns any vault member can write (a shared vault's title, note,
 * tags): a leading `=`, `+`, `-`, `@`, tab or CR would run as a formula when
 * the file is opened in a spreadsheet, so it gets a `'` in front (OWASP CSV
 * injection). Credentials (`username`, `password`, `totp`, `websites`) stay as
 * they are: changing them would break the import this file is meant for.
 */
const FORMULA_ESCAPED = new Set<string>([
  "vault",
  "title",
  "note",
  "fields",
  "customFields",
  "tags",
]);

function escapeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** One line per value: "key: value" for type fields and custom fields. */
function keyValueLines(entries: [string, unknown][]): string {
  return entries
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("\n");
}

function csvRow(record: ExportRecord, vaultNames: Map<string, string>): string[] {
  const r = record as ExportRecord & Partial<Record<string, unknown>>;
  const str = (key: string) => (typeof r[key] === "string" ? (r[key] as string) : "");
  const cells: Record<(typeof CSV_COLUMNS)[number], string> = {
    vault: vaultNames.get(record.vaultId) ?? "",
    type: record.type,
    title: record.title,
    username: str("username"),
    password: str("password"),
    websites: record.type === "login" ? (record.websites ?? []).map((w) => w.value).join("\n") : "",
    totp: str("totp"),
    note: record.note ?? "",
    fields: keyValueLines(Object.entries(record).filter(([key]) => !OWN_COLUMN.has(key))),
    customFields: keyValueLines((record.customFields ?? []).map((f) => [f.title, f.value])),
    tags: (record.tags ?? []).join(", "),
    favorite: record.favorite ? "true" : "",
    createdAt: record.createdAt ?? "",
    updatedAt: record.updatedAt,
  };
  return CSV_COLUMNS.map((column) =>
    FORMULA_ESCAPED.has(column) ? escapeFormula(cells[column]) : cells[column],
  );
}

/**
 * One row per record. Logins fill the usual columns (most importers read
 * those); every other type-specific field goes into `fields` as "key: value"
 * lines, so nothing is left out.
 */
export function exportToCsv(data: ExportData): string {
  const vaultNames = new Map(data.vaults.map((v) => [v.id, v.name]));
  const rows = [[...CSV_COLUMNS], ...data.records.map((r) => csvRow(r, vaultNames))];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

// ── File ─────────────────────────────────────────────────────────────────────

export type ExportFile = { fileName: string; mimeType: string; content: string };

/** `passmgr-backup-2026-10-08.json`, `passmgr-export-2026-10-08.csv`, …: the local date. */
export function exportFileName(format: ExportFormat, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return format === "encrypted"
    ? `passmgr-backup-${date}.json`
    : `passmgr-export-${date}.${format}`;
}

/** The file for `format`. `password` is the export password, needed for `encrypted`. */
export async function exportFile(
  data: ExportData,
  format: ExportFormat,
  password?: string,
): Promise<ExportFile> {
  const fileName = exportFileName(format, new Date(data.exportedAt));
  switch (format) {
    case "encrypted":
      if (!password) throw new Error("An encrypted export needs a password");
      return {
        fileName,
        mimeType: "application/json",
        content: await encryptExport(data, password),
      };
    case "json":
      return { fileName, mimeType: "application/json", content: exportToJson(data) };
    case "csv":
      return { fileName, mimeType: "text/csv", content: exportToCsv(data) };
  }
}
