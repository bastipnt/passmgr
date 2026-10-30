import {
  CURRENT_SCHEMA_VERSION,
  type CustomField,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  type ExportData,
  type ExportRecord,
  MAX_FIELD_LENGTH,
  MAX_RECORD_PAYLOAD_BYTES,
  MAX_TAGS,
  MAX_TITLE_LENGTH,
  normalizeTags,
  type RecordData,
  type RecordType,
  recordDataSchema,
  recordPayloadBytes,
  recordPayloadJson,
  sanitizeTag,
} from "@repo/schema";
import { counted, normalizeWebsite, parseWebsite, websiteHost } from "@repo/util";
import { RECORD_TYPE_LABELS } from "../records/record-field-specs";

/*
 * Import from another password manager: each source's parser turns its file
 * into `ForeignRecord`s, collected here into an `ExportData` of one vault, so
 * the import itself is `importExportData`, the same path as a backup. Every
 * record gets a new id; nothing is matched against the vault.
 */

export type ImportSource = "chrome" | "firefox" | "safari" | "bitwarden" | "1password" | "keepass";

export const IMPORT_SOURCE_LABELS: Record<ImportSource, string> = {
  chrome: "Chrome / Edge",
  firefox: "Firefox",
  safari: "Safari",
  bitwarden: "Bitwarden",
  "1password": "1Password",
  keepass: "KeePass",
};

/** "Chrome / Edge, Firefox, … or KeePass", for help text. */
export const IMPORT_SOURCE_LIST = (() => {
  const labels = Object.values(IMPORT_SOURCE_LABELS);
  return `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;
})();

/**
 * - `unsupported_type`: an item kind with no record type here (a 1Password document)
 * - `invalid`: no valid record even after cleanup
 * - `too_large`: a field, or the whole item, over the limits (`record-limits.ts`)
 */
export type SkipReason = "unsupported_type" | "invalid" | "too_large";

export type ForeignImportReport = {
  skipped: { title: string; reason: SkipReason }[];
  /** Imported records whose passkey was left behind. */
  passkeys: number;
  /** Attached files left behind. */
  attachments: number;
  /** Earlier passwords from the source's history, not imported. */
  previousPasswords: number;
};

export type ForeignImport = {
  source: ImportSource;
  data: ExportData;
  /** The one vault `data` holds: map it to the target vault (`ImportOptions.vaultMap`). */
  vaultId: string;
  report: ForeignImportReport;
  /** Read from an encrypted file (a KeePass database): no plaintext copy to delete. */
  fileEncrypted?: boolean;
};

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  unsupported_type: "no matching item type here",
  invalid: "not a valid item",
  too_large: "too large",
};

/** "12 logins, 1 credit card": what an import holds, per type. */
export function describeRecordCounts(records: readonly { type: RecordType }[]): string {
  const counts = new Map<RecordType, number>();
  for (const { type } of records) counts.set(type, (counts.get(type) ?? 0) + 1);
  return [...counts]
    .map(([type, n]) => counted(n, RECORD_TYPE_LABELS[type].noun, RECORD_TYPE_LABELS[type].nouns))
    .join(", ");
}

const notImported = (n: number, one: string, many: string) =>
  `${counted(n, one, many)} ${n === 1 ? "wasn't" : "weren't"} imported`;

/** One sentence per kind of data an import left behind (web + mobile). */
export function leftBehindNotes(report: ForeignImportReport): string[] {
  const notes: string[] = [];
  if (report.previousPasswords > 0)
    notes.push(
      `${notImported(report.previousPasswords, "earlier password", "earlier passwords")}, only the current ones.`,
    );
  if (report.passkeys > 0)
    notes.push(
      `${notImported(report.passkeys, "passkey", "passkeys")}. Keep using them in the other app.`,
    );
  if (report.attachments > 0)
    notes.push(`${notImported(report.attachments, "attached file", "attached files")}.`);
  return notes;
}

/** "2 items weren't imported: too large." — the short form of `report.skipped`. */
export function skippedNote(report: ForeignImportReport): string | undefined {
  const { skipped } = report;
  if (skipped.length === 0) return undefined;
  const reasons = [...new Set(skipped.map(({ reason }) => SKIP_REASON_LABELS[reason]))];
  return `${notImported(skipped.length, "item", "items")}: ${reasons.join(", ")}.`;
}

/** Before the import: what the file holds. */
export function foreignImportIntro(foreign: ForeignImport): string {
  const source = IMPORT_SOURCE_LABELS[foreign.source];
  const { records } = foreign.data;
  const file = foreign.fileEncrypted ? "database" : "export";
  return records.length > 0
    ? `${source} ${file}: ${describeRecordCounts(records)}. All of them are added as new items.`
    : `This ${source} ${file} holds nothing to import.`;
}

export function foreignImportDone(source: ImportSource, created: number): string {
  return `Imported ${counted(created, "item", "items")} from ${IMPORT_SOURCE_LABELS[source]}.`;
}

/** A failed import that wrote some batches: importing the file again duplicates them. */
export function importStoppedMessage(stopped: {
  written: number;
  total: number;
}): string | undefined {
  if (stopped.written === 0) return undefined;
  return `Imported ${stopped.written} of ${stopped.total} items, then the import stopped. Importing the file again adds the first ${stopped.written} a second time.`;
}

export const DELETE_EXPORT_FILE_HINT =
  "The export file holds your passwords unencrypted. Delete it now, and empty the trash.";

export type ForeignField = { title: string; value: string; secret?: boolean };

/** A record as a source gives it, before cleanup. Empty values are fine. */
export type ForeignRecord = {
  type: RecordType;
  title?: string;
  /** The type's own fields (`username`, `number`, `ssid`, …). */
  fields?: Record<string, string | boolean | undefined>;
  websites?: string[];
  note?: string;
  favorite?: boolean;
  tags?: string[];
  customFields?: ForeignField[];
  createdAt?: string;
  passwordChangedAt?: string;
  /** Parts of the item that don't come along; counted when the record is imported. */
  leftBehind?: Partial<Record<LeftBehind, number>>;
};

type LeftBehind = "passkeys" | "attachments" | "previousPasswords";

/** ISO string of a date, epoch milliseconds or a parseable string; `undefined` when it isn't one. */
export function isoDate(value: Date | number | string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function latestDate(dates: (string | undefined)[]): string | undefined {
  return dates
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

const EMAIL_TITLE = /^e-?mail(\s+address)?$/i;

/**
 * The record's payload, or why it can't be imported. A website that is no URL,
 * domain or app id is kept as a "Website" field, an empty title becomes the host,
 * the username (or email) or "Imported item"; a long one is cut.
 */
export function finishRecord(record: ForeignRecord): RecordData | SkipReason {
  const customFields: CustomField[] = (record.customFields ?? [])
    .filter((field) => field.value.trim() !== "")
    .map((field) => ({
      type: field.secret ? "secret" : "text",
      title: field.title.trim() || "Field",
      value: field.value,
    }));

  const websites: string[] = [];
  for (const raw of record.websites ?? []) {
    if (raw.trim() === "") continue;
    if (parseWebsite(raw)) websites.push(normalizeWebsite(raw));
    else customFields.push({ type: "text", title: "Website", value: raw.trim() });
  }

  const fields = Object.fromEntries(
    Object.entries(record.fields ?? {}).filter(([, value]) => value !== undefined && value !== ""),
  );
  if (record.type === "login" && fields.email === undefined) {
    const index = customFields.findIndex(
      (f) => f.type === "text" && EMAIL_TITLE.test(f.title) && f.value.length <= MAX_FIELD_LENGTH,
    );
    if (index >= 0) fields.email = customFields.splice(index, 1)[0]!.value;
  }
  const account = [fields.username, fields.email].find((v) => typeof v === "string");
  const title = (
    record.title?.trim() ||
    websites.map((value) => websiteHost(value)).find(Boolean) ||
    account ||
    "Imported item"
  ).slice(0, MAX_TITLE_LENGTH);
  const tags = normalizeTags((record.tags ?? []).map(sanitizeTag)).slice(0, MAX_TAGS);
  const hasPassword = typeof fields.password === "string";

  const candidate = {
    type: record.type,
    title,
    ...fields,
    ...(record.type === "login" && websites.length > 0
      ? { websites: unique(websites).map((value) => ({ value })) }
      : {}),
    ...(hasPassword && record.passwordChangedAt
      ? { passwordChangedAt: record.passwordChangedAt }
      : {}),
    ...(record.note?.trim() ? { note: record.note } : {}),
    ...(record.favorite ? { favorite: true } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(customFields.length > 0 ? { customFields } : {}),
  };
  const result = recordDataSchema.safeParse(candidate);
  if (!result.success) {
    return result.error.issues.some((issue) => issue.code === "too_big") ? "too_large" : "invalid";
  }
  const bytes = recordPayloadBytes(recordPayloadJson(result.data));
  return bytes > MAX_RECORD_PAYLOAD_BYTES ? "too_large" : result.data;
}

export class ForeignImportBuilder {
  readonly #vaultId = crypto.randomUUID();
  readonly #records: ExportRecord[] = [];
  readonly #report: ForeignImportReport = {
    skipped: [],
    passkeys: 0,
    attachments: 0,
    previousPasswords: 0,
  };

  readonly #source: ImportSource;
  readonly #now: Date;

  constructor(source: ImportSource, now: Date = new Date()) {
    this.#source = source;
    this.#now = now;
  }

  add(record: ForeignRecord): void {
    const data = finishRecord(record);
    if (typeof data === "string") {
      this.skip(record.title?.trim() || "Untitled", data);
      return;
    }
    this.#records.push({
      ...data,
      id: crypto.randomUUID(),
      vaultId: this.#vaultId,
      createdAt: record.createdAt ?? null,
      updatedAt: this.#now.toISOString(),
    });
    for (const [what, count] of Object.entries(record.leftBehind ?? {})) {
      this.#report[what as LeftBehind] += count;
    }
  }

  skip(title: string, reason: SkipReason): void {
    this.#report.skipped.push({ title, reason });
  }

  build(): ForeignImport {
    return {
      source: this.#source,
      vaultId: this.#vaultId,
      report: this.#report,
      data: {
        format: EXPORT_FORMAT,
        version: EXPORT_FORMAT_VERSION,
        exportedAt: this.#now.toISOString(),
        recordSchemaVersion: CURRENT_SCHEMA_VERSION,
        vaults: [{ id: this.#vaultId, name: IMPORT_SOURCE_LABELS[this.#source], kind: "shared" }],
        records: this.#records,
      },
    };
  }
}
