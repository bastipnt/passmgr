export function clampInt(raw: string, min: number, max: number): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

const BYTE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

/** Decimal units, like the browsers' own storage settings: "1.2MB". */
export function formatBytes(value: number): string {
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  return new Intl.NumberFormat("en", {
    style: "unit",
    unit: BYTE_UNITS[unit],
    unitDisplay: "narrow",
    maximumFractionDigits: 1,
  }).format(value);
}
