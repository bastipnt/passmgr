/**
 * The server as a full address: web may be configured with a path on its own
 * origin (`/trpc`), useless on a printed page.
 */
export function absoluteServerUrl(url: string): string {
  try {
    return new URL(url, globalThis.location?.href).href;
  } catch {
    return url;
  }
}

/** The server's host as the user knows it (`vault.example.net`), for display. */
export function serverHost(url: string): string {
  try {
    return new URL(url, globalThis.location?.href).host || url;
  } catch {
    return url;
  }
}
