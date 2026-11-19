import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const WORKSPACES = ["apps", "packages"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("source files", () => {
  it("hold no raw NUL byte, which makes git treat them as binary and hides their diffs", () => {
    const offenders = WORKSPACES.flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .filter((file) => readFileSync(file).includes(0))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
