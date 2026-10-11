export function toLocalDateStr(date: string | null) {
  if (date === null) return "";

  return new Date(date).toLocaleDateString();
}

/** `2026-10-08`: the local calendar date, for file names and printed stamps. */
export function localDateStamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
