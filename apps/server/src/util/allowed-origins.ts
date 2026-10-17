/** The Vite dev server, `vite preview` and the e2e web container. */
const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:4173", "http://localhost:8080"];

/**
 * Exact origins (scheme, host, port) the web app is served from: CORS and the
 * WebAuthn origin check. `CORS_ORIGIN` is a comma-separated list; without it
 * only development gets the local defaults.
 */
export function parseAllowedOrigins(value: string | undefined, production: boolean): Set<string> {
  const entries = value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries?.length) {
    if (production) throw new Error("CORS_ORIGIN must be set in production");
    return new Set(DEV_ORIGINS);
  }
  return new Set(entries.map(toOrigin));
}

function toOrigin(entry: string): string {
  const url = URL.canParse(entry) ? new URL(entry) : undefined;
  if (
    !url ||
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.host.includes("*")
  )
    throw new Error(`CORS_ORIGIN: "${entry}" is not an origin (e.g. https://pass.example.com)`);
  return url.origin;
}

export const allowedOrigins = parseAllowedOrigins(
  process.env.CORS_ORIGIN,
  process.env.NODE_ENV === "production",
);
