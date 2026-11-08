import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const SOURCES = ["packages/client/src", "apps/web/src", "apps/mobile/src"];
const ALLOWED = new Set([
  "packages/client/src/errors/log-error.ts",
  "packages/client/src/util/perf.ts", // dev-only timings, no error data
]);
const CONSOLE_CALL = /\bconsole\.(log|error|warn|info|debug|trace)\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("console", () => {
  it("is only used through logError / logWarning, which keep error messages out of production logs", () => {
    const offenders = SOURCES.flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .map((file) => relative(ROOT, file))
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => CONSOLE_CALL.test(readFileSync(join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
