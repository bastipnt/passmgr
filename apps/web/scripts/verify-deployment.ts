/**
 * Checks a deployed web app against a release's published SHA256SUMS (attached to the GitHub
 * release, written by vite-plugin-build-integrity.ts) and the security headers of that release's
 * Caddyfile. Take both from the release tag, never from the site you are checking:
 *
 *   pnpm --filter web verify:deployment https://vault.example.com ./SHA256SUMS [./Caddyfile]
 *
 * Without a Caddyfile argument the one in this checkout is used.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const CONCURRENCY = 8;
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

const [
  siteUrl,
  sumsPath,
  caddyfilePath = fileURLToPath(new URL("../../../Caddyfile", import.meta.url)),
] = process.argv.slice(2);
if (!siteUrl || !sumsPath) {
  console.error("usage: verify-deployment <site-url> <SHA256SUMS> [Caddyfile]");
  process.exit(2);
}

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

const expectedHeaders = parseHeaders(await readFile(caddyfilePath, "utf8"));

const site = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
const failures: string[] = [];

type Check = (typeof expected)[number] & { encoding: (typeof ENCODINGS)[number] };

function parseHeaders(caddyfile: string) {
  return PINNED_HEADERS.map((name) => {
    const values = [
      ...caddyfile.matchAll(new RegExp(`^\\s*${name}\\s+(?:"([^"]*)"|(\\S+))\\s*$`, "gm")),
    ];
    if (values.length !== 1)
      throw new Error(`${caddyfilePath}: expected one ${name}, found ${values.length}`);
    return { name, value: values[0][1] ?? values[0][2] };
  });
}

async function check({ digest, file, encoding }: Check) {
  const label = `${file || "/"} (${encoding})`;
  const response = await fetch(new URL(file, site), {
    cache: "no-store",
    headers: { "Accept-Encoding": encoding },
  });
  if (!response.ok) {
    failures.push(`${label}: HTTP ${response.status}`);
    return;
  }
  // Caddy sends them on every response, and sw.js and the workers get their CSP and COEP from
  // their own response, not the page's. Headers don't vary by encoding: check them once per path.
  if (encoding === "identity") {
    for (const { name, value } of expectedHeaders) {
      const served = response.headers.get(name);
      if (served !== value)
        failures.push(
          `${label}: ${name} is ${JSON.stringify(served)}, expected ${JSON.stringify(value)}`,
        );
    }
  }
  const served = response.headers.get("content-encoding") ?? "identity";
  if (served !== encoding && served !== "identity") {
    failures.push(`${label}: served as ${served}`);
    return;
  }
  // fetch decodes the body, so every variant hashes to the file's own digest.
  const actual = createHash("sha256")
    .update(Buffer.from(await response.arrayBuffer()))
    .digest("hex");
  if (actual !== digest) failures.push(`${label}: sha256 ${actual}, expected ${digest}`);
}

const checks = expected.flatMap((entry) => ENCODINGS.map((encoding) => ({ ...entry, encoding })));

for (let i = 0; i < checks.length; i += CONCURRENCY) {
  await Promise.all(checks.slice(i, i + CONCURRENCY).map(check));
}

if (failures.length > 0) {
  console.error(`${failures.length} problems in ${checks.length} checks against the release:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(
  `All ${expected.length} paths match the release in every encoding, all with its ${PINNED_HEADERS.join(", ")}.`,
);
