import { RECORD_TYPES, type RecordType, recordDataSchema } from "@repo/schema";
import { CSV_COLUMNS, FORMULA_ESCAPED, unescapeFormula } from "../export/export-file";
import { csvRecords } from "./csv";
import {
  type ForeignField,
  type ForeignImport,
  ForeignImportBuilder,
  type ForeignRecord,
  isoDate,
} from "./foreign-import";

/*
 * This app's own CSV export (`exportToCsv`). It has no ids, so every row is a
 * new record, and all of them go into the one vault the import is aimed at (the
 * `vault` column is dropped). Custom field types aren't in the file: they come
 * back as text.
 */

export function isOwnCsv(header: readonly string[]): boolean {
  return header.slice(0, 3).join() === "vault,type,title";
}

const BASE_KEYS = new Set([
  "type",
  "title",
  "note",
  "favorite",
  "tags",
  "customFields",
  "attachments",
]);

const isRecordType = (type: string): type is RecordType =>
  (RECORD_TYPES as readonly string[]).includes(type);

/** The fields of a type's own payload, with whether each one is a boolean. */
function typeFields(type: RecordType): Map<string, boolean> {
  const shape = recordDataSchema.options.find((o) => o.shape.type.value === type)!.shape as Record<
    string,
    { safeParse(value: unknown): { success: boolean } }
  >;
  return new Map(
    Object.entries(shape)
      .filter(([key]) => !BASE_KEYS.has(key))
      .map(([key, schema]) => [
        key,
        !schema.safeParse("x").success && schema.safeParse(true).success,
      ]),
  );
}

/**
 * "key: value" lines back into entries. A line that doesn't start an entry
 * (`isKey` says which do) continues the previous value: values hold line breaks.
 */
function keyValueEntries(
  text: string,
  isKey: (key: string) => boolean,
): [key: string, value: string][] {
  const entries: [string, string][] = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf(": ");
    const key = at > 0 ? line.slice(0, at) : undefined;
    if (key !== undefined && isKey(key)) entries.push([key, line.slice(at + 2)]);
    else if (entries.length > 0) entries.at(-1)![1] += `\n${line}`;
  }
  return entries;
}

const lines = (text: string) => text.split("\n").filter((line) => line.trim() !== "");

export function importOwnCsv(rows: string[][]): ForeignImport {
  const builder = new ForeignImportBuilder("passmgr");

  for (const raw of csvRecords(rows)) {
    const row = Object.fromEntries(
      CSV_COLUMNS.map((column) => [
        column,
        FORMULA_ESCAPED.has(column)
          ? unescapeFormula(raw[column.toLowerCase()] ?? "")
          : (raw[column.toLowerCase()] ?? ""),
      ]),
    ) as Record<(typeof CSV_COLUMNS)[number], string>;

    const type = row.type.trim();
    if (!isRecordType(type)) {
      builder.skip(row.title.trim() || "Untitled", "unsupported_type");
      continue;
    }

    const known = typeFields(type);
    const fields: ForeignRecord["fields"] = {};
    const columns = {
      username: row.username,
      email: row.email,
      password: row.password,
      totp: row.totp,
    };
    for (const [key, value] of [
      ...Object.entries(columns),
      ...keyValueEntries(row.fields, (key) => known.has(key)),
    ]) {
      if (known.has(key)) fields[key] = known.get(key) ? value === "true" : value;
    }

    const customFields: ForeignField[] = keyValueEntries(row.customFields, () => true).map(
      ([title, value]) => ({ title, value }),
    );

    builder.add({
      type,
      title: row.title,
      fields,
      websites: type === "login" ? lines(row.websites) : undefined,
      note: row.note,
      favorite: row.favorite === "true",
      tags: row.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      customFields,
      createdAt: isoDate(row.createdAt),
    });
  }
  return builder.build();
}
