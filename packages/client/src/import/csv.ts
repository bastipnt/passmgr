/**
 * RFC 4180 rows: quoted cells may hold commas, doubled quotes and line breaks.
 * A leading BOM is dropped, `\r\n` and `\n` both end a row, blank rows are skipped.
 */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const endRow = () => {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
    cell = "";
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") endRow();
    else if (char === "\r") {
      if (input[i + 1] === "\n") i++;
      endRow();
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

/** Rows as objects keyed by the header row, header names lowercased. */
export function csvRecords(rows: string[][]): Record<string, string>[] {
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((name) => name.trim().toLowerCase());
  return body.map((cells) => Object.fromEntries(keys.map((key, i) => [key, cells[i] ?? ""])));
}
