import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_LINE_LENGTH = 120;

/** Over-long lines as `{ line, length }`; code blocks, tables and URL lines are allowed. */
export function findLongLines(text, max = MAX_LINE_LENGTH) {
  const found = [];
  let fenced = false;
  text.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced || line.trimStart().startsWith("|") || /https?:\/\//.test(line)) return;
    const length = Array.from(line).length;
    if (length > max) found.push({ line: index + 1, length });
  });
  return found;
}

export function parseExemptList(text) {
  return new Set(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

/** Violations as `path:line (length)` for every non-exempt file. */
export function check(files, read, exempt, max = MAX_LINE_LENGTH) {
  return files
    .filter((file) => !exempt.has(file))
    .flatMap((file) =>
      findLongLines(read(file), max).map((v) => `${file}:${v.line} (${v.length} chars)`),
    );
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..");
  const files = execFileSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const exempt = parseExemptList(readFileSync(join(here, "md-line-length-exempt.txt"), "utf8"));
  const violations = check(files, (file) => readFileSync(join(root, file), "utf8"), exempt);
  if (violations.length === 0) return;
  console.error(`Markdown lines over ${MAX_LINE_LENGTH} characters:\n${violations.join("\n")}`);
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
