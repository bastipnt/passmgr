/**
 * String utilities
 */

/**
 * Normalize a string by trimming and lowercasing
 */
export function normalize(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Check if a string is empty (after trimming)
 */
export function isEmpty(input: string): boolean {
  return input.trim().length === 0;
}

/**
 * Capitalize the first letter of a string
 */
export function capitalize(input: string): string {
  if (isEmpty(input)) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

export function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const UUIDV4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A stable, non-cryptographic hash of a string (for picking colours and the like). */
export function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

let graphemes: Intl.Segmenter | undefined;

/** Words split on whitespace; characters as a reader counts them (an emoji is one). */
export function textStats(text: string): { words: number; characters: number } {
  const words = text.match(/\S+/gu)?.length ?? 0;
  if (typeof Intl === "undefined" || !("Segmenter" in Intl)) {
    return { words, characters: Array.from(text).length };
  }
  graphemes ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let characters = 0;
  for (const segment of graphemes.segment(text)) if (segment) characters++;
  return { words, characters };
}
