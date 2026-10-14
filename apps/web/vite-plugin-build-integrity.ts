import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

const INDEX_FILE = "index.html";
const SW_FILE = "sw.js";
const SUMS_FILE = "SHA256SUMS";
const MARKER = "self.__PRECACHE_MANIFEST__";

/** Build output the app never fetches; precaching it only costs the install. */
const SKIP = [
  /\.map$/,
  /^sw\.js$/,
  /^SHA256SUMS$/,
  /^robots\.txt$/,
  /^sitemap\.xml$/,
  /^og-image\.png$/,
];

const ASSET_TAG = /<(script|link)\b[^>]*?\s(?:src|href)="([^"]+)"[^>]*>/g;

/**
 * Pins the served code to the build. Runs after the bundle is written, when `dist` holds the
 * copied public files, the workers and the wasm too, in this order, since each step hashes what
 * the previous one wrote:
 * 1. `integrity` on every asset `<script>` / `<link>` of index.html.
 * 2. The precache manifest in the built service worker (`public/sw.js`): every file of `dist`
 *    but `SKIP`, with its SRI hash. The SW downloads all of them on install with that `integrity`,
 *    so lazy route chunks load offline even if they were never opened online, and a tampered one
 *    fails the install.
 * 3. `SHA256SUMS` over all of `dist`, published by the release outside the web host
 *    (`scripts/verify-deployment.ts` checks a deployment against it).
 */
export function buildIntegrity(): Plugin {
  let outDir = "";
  let base = "/";
  let assetsDir = "";

  return {
    name: "build-integrity",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      base = config.base;
      assetsDir = config.build.assetsDir;
    },
    async closeBundle() {
      await addSubresourceIntegrity(outDir, base, assetsDir);
      await writePrecacheManifest(outDir);
      await writeChecksums(outDir);
    },
  };
}

async function addSubresourceIntegrity(outDir: string, base: string, assetsDir: string) {
  const indexPath = path.join(outDir, INDEX_FILE);
  const html = await readFile(indexPath, "utf8");
  const integrities = new Map<string, string>();
  for (const [tag, , url] of html.matchAll(ASSET_TAG)) {
    if (url.startsWith(`${base}${assetsDir}/`) && !tag.includes(" integrity=")) {
      integrities.set(url, sri(await readFile(path.join(outDir, url.slice(base.length)))));
    }
  }
  if (integrities.size === 0) throw new Error(`build-integrity: no assets found in ${INDEX_FILE}`);

  const pinned = html.replace(ASSET_TAG, (tag: string, _name: string, url: string) => {
    const integrity = integrities.get(url);
    return integrity ? tag.replace(/\s*\/?>$/, (end) => ` integrity="${integrity}"${end}`) : tag;
  });
  await writeFile(indexPath, pinned);
}

async function writePrecacheManifest(outDir: string) {
  const files: Record<string, string> = {};
  for (const file of await listFiles(outDir)) {
    if (SKIP.some((pattern) => pattern.test(file))) continue;
    files[file] = sri(await readFile(path.join(outDir, file)));
  }
  const version = createHash("sha256").update(JSON.stringify(files)).digest("hex").slice(0, 16);

  const swPath = path.join(outDir, SW_FILE);
  const sw = await readFile(swPath, "utf8");
  if (!sw.includes(MARKER)) throw new Error(`build-integrity: ${MARKER} not found in ${SW_FILE}`);
  await writeFile(swPath, sw.replace(MARKER, JSON.stringify({ version, files })));
}

async function writeChecksums(outDir: string) {
  const lines: string[] = [];
  for (const file of await listFiles(outDir)) {
    if (file === SUMS_FILE) continue;
    const digest = createHash("sha256")
      .update(await readFile(path.join(outDir, file)))
      .digest("hex");
    lines.push(`${digest}  ${file}`);
  }
  await writeFile(path.join(outDir, SUMS_FILE), `${lines.join("\n")}\n`);
}

async function listFiles(outDir: string) {
  return (await readdir(outDir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(outDir, path.join(entry.parentPath, entry.name)))
    .map((file) => file.split(path.sep).join("/"))
    .sort();
}

function sri(content: Buffer) {
  return `sha384-${createHash("sha384").update(content).digest("base64")}`;
}
