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

const site = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
const failures: string[] = [];

async function check({ digest, file }: { digest: string; file: string }) {
  const response = await fetch(new URL(file, site), { cache: "no-store" });
  if (!response.ok) {
    failures.push(`${file}: HTTP ${response.status}`);
    return;
  }
  const actual = createHash("sha256")
    .update(Buffer.from(await response.arrayBuffer()))
    .digest("hex");
  if (actual !== digest) failures.push(`${file}: sha256 ${actual}, expected ${digest}`);
}

for (let i = 0; i < expected.length; i += CONCURRENCY) {
  await Promise.all(expected.slice(i, i + CONCURRENCY).map(check));
}

if (failures.length > 0) {
  console.error(`${failures.length} of ${expected.length} files differ from the release:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`All ${expected.length} files match the release.`);
