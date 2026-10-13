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
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** A website's host for matching: lowercase, no `www.`, port or path; `undefined` if it isn't a URL. */
export function websiteHost(url: string): string | undefined {
  try {
    return new URL(normalizeWebsiteUrl(url.trim())).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

const BARE_HOST =
  /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i;

/** An http(s) URL for a website, `https://` added to a bare host; `undefined` for anything else. */
export function websiteUrl(raw: string): string | undefined {
  const value = raw.trim();
  const candidate = /^https?:\/\//i.test(value)
    ? value
    : BARE_HOST.test(value)
      ? `https://${value}`
      : undefined;
  if (!candidate) return undefined;
  try {
    return new URL(candidate).protocol.startsWith("http") ? candidate : undefined;
  } catch {
    return undefined;
  }
}

export const UUIDV4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
