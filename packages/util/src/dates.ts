export function toLocalDateStr(date: string | null) {
  if (date === null) return "";

  return new Date(date).toLocaleDateString();
}
