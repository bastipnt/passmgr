/**
 * Checks a deployed web app against a release's published SHA256SUMS (attached to the GitHub
 * release, written by vite-plugin-build-integrity.ts). Fetch the sums from the release, never
 * from the site you are checking:
 *
 *   pnpm --filter web verify:deployment https://vault.example.com ./SHA256SUMS
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const CONCURRENCY = 8;
// Caddy serves a precompressed copy per encoding (`scripts/precompress.ts`), each its own file on
// the host: check every variant a browser can get, not just the one this runtime asks for.
const ENCODINGS = ["identity", "gzip", "br"] as const;

const [siteUrl, sumsPath] = process.argv.slice(2);
if (!siteUrl || !sumsPath) {
  console.error("usage: verify-deployment <site-url> <SHA256SUMS>");
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
// Browsers load the app from "/", not "/index.html"; a host could serve another document there.
if (index) expected.push({ digest: index.digest, file: "" });

const site = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
const failures: string[] = [];

type Check = { digest: string; file: string; encoding: (typeof ENCODINGS)[number] };

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
  console.error(`${failures.length} of ${checks.length} checks differ from the release:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`All ${expected.length} files match the release, in every encoding.`);
