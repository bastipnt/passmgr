import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { localQueryOptions } from "../src/util/local-query-options";

const SRC = join(import.meta.dirname, "../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("localQueryOptions", () => {
  it("never pauses for the browser's offline flag", () => {
    expect(localQueryOptions.networkMode).toBe("always");
  });

  it("is the only place that sets a network mode", () => {
    const setters = sourceFiles(SRC)
      .filter((file) => /\bnetworkMode\s*:/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    expect(setters).toEqual(["util/local-query-options.ts"]);
  });
});
