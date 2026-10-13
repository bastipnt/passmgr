import { csvRecords } from "./csv";
import { type ForeignImport, ForeignImportBuilder, isoDate } from "./foreign-import";

type BrowserSource = "chrome" | "firefox" | "safari";

/** Which browser wrote a CSV, from its (lowercased) header. Chrome's is also Edge's, Brave's and Opera's. */
export function browserCsvSource(header: readonly string[]): BrowserSource | undefined {
  const has = (...names: string[]) => names.every((name) => header.includes(name));
  if (has("url", "username", "password", "httprealm")) return "firefox";
  if (has("title", "url", "username", "password")) return "safari";
  if (has("name", "url", "username", "password")) return "chrome";
  return undefined;
}

function epochMs(value: string | undefined): string | undefined {
  return value && /^\d+$/.test(value) ? isoDate(Number(value)) : undefined;
}

/** A browser's password export: one login per row. */
export function importBrowserCsv(rows: string[][], source: BrowserSource): ForeignImport {
  const builder = new ForeignImportBuilder(source);
  for (const row of csvRecords(rows)) {
    builder.add({
      type: "login",
      title: row.name ?? row.title,
      fields: { username: row.username, password: row.password, totp: row.otpauth },
      websites: [row.url ?? ""],
      note: row.note ?? row.notes,
      createdAt: epochMs(row.timecreated),
      passwordChangedAt: epochMs(row.timepasswordchanged),
    });
  }
  return builder.build();
}
