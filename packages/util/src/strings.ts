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

export function normalizeWebsiteUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}
