// Writes `.br` and `.gz` next to each compressible file of the built app, for Caddy's
// `file_server { precompressed br gzip }`. Run after `vite build`: index.html and sw.js are
// final only once the build-integrity plugin has rewritten them.
// Usage: node scripts/precompress.ts [dist]
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const COMPRESSIBLE = /\.(js|mjs|css|html|svg|json|webmanifest|wasm|txt|xml)$/;
const MIN_BYTES = 1024;

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

const dist = path.resolve(process.argv[2] ?? "dist");
const entries = await readdir(dist, { recursive: true, withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && COMPRESSIBLE.test(entry.name))
  .map((entry) => path.join(entry.parentPath, entry.name));

let count = 0;
let before = 0;
let after = 0;
await Promise.all(
  files.map(async (file) => {
    const content = await readFile(file);
    if (content.length < MIN_BYTES) return;
    const [br, gzipped] = await Promise.all([
      brotli(content, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: content.length,
        },
      }),
      gz(content, { level: constants.Z_BEST_COMPRESSION }),
    ]);
    count += 1;
    before += content.length;
    after += br.length;
    if (br.length < content.length) await writeFile(`${file}.br`, br);
    if (gzipped.length < content.length) await writeFile(`${file}.gz`, gzipped);
  }),
);

console.log(
  `precompress: ${count} files, ${(before / 1024).toFixed(0)} KiB → ${(after / 1024).toFixed(0)} KiB brotli`,
);
