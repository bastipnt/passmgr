import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

const SW_FILE = "sw.js";
const MARKER = "self.__PRECACHE_MANIFEST__";

/** Build output the app never fetches; precaching it only costs the install. */
const SKIP = [/\.map$/, /^sw\.js$/, /^robots\.txt$/, /^sitemap\.xml$/, /^og-image\.png$/];

/**
 * Writes the precache manifest into the built service worker (`public/sw.js`): every file of
 * `dist` plus a version hashed over their contents. The SW downloads all of them on install, so
 * lazy route chunks load offline even if they were never opened online. Runs after the bundle
 * is written, when `dist` holds the copied public files, the workers and the wasm too.
 */
export function precache(): Plugin {
  let outDir = "";

  return {
    name: "precache",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(outDir, path.join(entry.parentPath, entry.name)))
        .map((file) => file.split(path.sep).join("/"))
        .filter((file) => !SKIP.some((pattern) => pattern.test(file)))
        .sort();

      const hash = createHash("sha256");
      for (const file of files) {
        hash.update(file).update(await readFile(path.join(outDir, file)));
      }
      const manifest = { version: hash.digest("hex").slice(0, 16), files };

      const swPath = path.join(outDir, SW_FILE);
      const sw = await readFile(swPath, "utf8");
      if (!sw.includes(MARKER)) throw new Error(`precache: ${MARKER} not found in ${SW_FILE}`);
      await writeFile(swPath, sw.replace(MARKER, JSON.stringify(manifest)));
    },
  };
}
