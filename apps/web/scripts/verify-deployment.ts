/**
 * Checks a deployed web app against a release's published SHA256SUMS (attached to the GitHub
 * release, written by vite-plugin-build-integrity.ts) and the security headers of that release's
 * Caddyfile. Take both from the release tag, never from the site you are checking:
 *
 *   pnpm --filter web verify:deployment https://vault.example.com ./SHA256SUMS [./Caddyfile]
 *
 * Without a Caddyfile argument the one in this checkout is used. Exits 1 on a mismatch (digest,
 * fallback route, header, a 4xx), 3 when only fetches failed (network error, timeout, 5xx), 2 on usage,
 * 4 when it could not compare at all (a malformed site URL, an unreadable or malformed SHA256SUMS or
 * Caddyfile).
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 30_000;
// Caddy serves a precompressed copy per encoding (`scripts/precompress.ts`), each its own file on
// the host: check every variant a browser can get, not just the one this runtime asks for.
const ENCODINGS = ["identity", "gzip", "br"] as const;
// Deep links land on the SPA fallback, not on "/": a host could serve the genuine index.html at "/"
// and other HTML there. The random path stands for every route no list here can name.
const FALLBACK_ROUTES = ["login", "welcome", "create", "settings", `verify-${randomUUID()}`];
const PINNED_HEADERS = [
  "Content-Security-Policy",
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Embedder-Policy",
] as const;

export const EXIT_CODES = { mismatch: 1, usage: 2, unreachable: 3, error: 4 } as const;

export type FailureKind = "mismatch" | "unreachable";
export type Failure = { kind: FailureKind; message: string };
export type PinnedHeader = { name: string; value: string };
export type Check = { digest: string; file: string; encoding: (typeof ENCODINGS)[number] };

// One mismatch outweighs any number of unreachable files: it was compared and differs.
export function verdict(failures: readonly Failure[]): FailureKind | undefined {
  if (failures.some(({ kind }) => kind === "mismatch")) return "mismatch";
  return failures.length > 0 ? "unreachable" : undefined;
}

function parseHeaders(caddyfile: string, caddyfilePath: string): PinnedHeader[] {
  return PINNED_HEADERS.map((name) => {
    const values = [
      ...caddyfile.matchAll(new RegExp(`^\\s*${name}\\s+(?:"([^"]*)"|(\\S+))\\s*$`, "gm")),
    ];
    if (values.length !== 1)
      throw new Error(`${caddyfilePath}: expected one ${name}, found ${values.length}`);
    return { name, value: values[0][1] ?? values[0][2] };
  });
}

export async function check(
  site: string,
  expectedHeaders: readonly PinnedHeader[],
  { digest, file, encoding }: Check,
): Promise<Failure[]> {
  const label = `${file || "/"} (${encoding})`;
  const mismatch = (message: string): Failure => ({
    kind: "mismatch",
    message: `${label}: ${message}`,
  });
  let response: Response;
  let body: ArrayBuffer;
  try {
    response = await fetch(new URL(file, site), {
      cache: "no-store",
      headers: { "Accept-Encoding": encoding },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    // A reset mid-body is as unreachable as one before the headers.
    body = await response.arrayBuffer();
  } catch (error) {
    return [{ kind: "unreachable", message: `${label}: ${String(error)}` }];
  }
  if (response.status >= 500)
    return [{ kind: "unreachable", message: `${label}: HTTP ${response.status}` }];
  if (!response.ok) return [mismatch(`HTTP ${response.status}`)];

  const failures: Failure[] = [];
  // Caddy sends them on every response, and sw.js and the workers get their CSP and COEP from
  // their own response, not the page's. Headers don't vary by encoding: check them once per path.
  if (encoding === "identity") {
    for (const { name, value } of expectedHeaders) {
      const served = response.headers.get(name);
      if (served !== value)
        failures.push(
          mismatch(`${name} is ${JSON.stringify(served)}, expected ${JSON.stringify(value)}`),
        );
    }
  }
  const served = response.headers.get("content-encoding") ?? "identity";
  if (served !== encoding && served !== "identity")
    return [...failures, mismatch(`served as ${served}`)];
  // fetch decodes the body, so every variant hashes to the file's own digest.
  const actual = createHash("sha256").update(Buffer.from(body)).digest("hex");
  if (actual !== digest) failures.push(mismatch(`sha256 ${actual}, expected ${digest}`));
  return failures;
}

// A site that can't be fetched at all must be an error: a fetch per file would call it unreachable.
function parseSite(siteUrl: string): string {
  const site = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  const valid = URL.canParse(site) && ["https:", "http:"].includes(new URL(site).protocol);
  if (!valid) throw new Error(`not an http(s) URL: ${JSON.stringify(siteUrl)}`);
  return site;
}

async function main([
  siteUrl,
  sumsPath,
  caddyfilePath = fileURLToPath(new URL("../../../Caddyfile", import.meta.url)),
]: readonly string[]): Promise<number> {
  if (!siteUrl || !sumsPath) {
    console.error("usage: verify-deployment <site-url> <SHA256SUMS> [Caddyfile]");
    return EXIT_CODES.usage;
  }
  const site = parseSite(siteUrl);

  const expected = (await readFile(sumsPath, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
      if (!match) throw new Error(`malformed line in ${sumsPath}: ${line}`);
      return { digest: match[1], file: match[2] };
    });

  const index = expected.find(({ file }) => file === "index.html");
  if (!index) throw new Error(`${sumsPath} has no index.html`);
  // Browsers load the app from "/", not "/index.html"; a host could serve another document there.
  for (const file of ["", ...FALLBACK_ROUTES]) expected.push({ digest: index.digest, file });

  const expectedHeaders = parseHeaders(await readFile(caddyfilePath, "utf8"), caddyfilePath);
  const checks = expected.flatMap((entry) => ENCODINGS.map((encoding) => ({ ...entry, encoding })));

  const failures: Failure[] = [];
  for (let i = 0; i < checks.length; i += CONCURRENCY) {
    const batch = checks
      .slice(i, i + CONCURRENCY)
      .map((entry) => check(site, expectedHeaders, entry));
    failures.push(...(await Promise.all(batch)).flat());
  }

  const kind = verdict(failures);
  if (kind) {
    console.error(
      `${failures.length} problems in ${checks.length} checks against the release (${kind}):`,
    );
    for (const { kind, message } of failures) console.error(`  [${kind}] ${message}`);
    return EXIT_CODES[kind];
  }
  console.log(
    `All ${expected.length} paths match the release in every encoding, all with its ${PINNED_HEADERS.join(", ")}.`,
  );
  return 0;
}

/** The exit code for `args` (site URL, SHA256SUMS, optional Caddyfile). */
export async function run(args: readonly string[]): Promise<number> {
  // An uncaught throw exits 1, which the workflow would read as a mismatch.
  return await main(args).catch((error: unknown) => {
    console.error(error);
    return EXIT_CODES.error;
  });
}

if (import.meta.main) process.exit(await run(process.argv.slice(2)));
