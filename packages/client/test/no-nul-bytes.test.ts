import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const WORKSPACES = ["apps", "packages"];

// Only git-tracked files: generated output (dist/, untracked files) never reaches a diff.
function nulOffenders(root: string): string[] {
  const listed = execFileSync("git", ["ls-files", "-z", "--", ...WORKSPACES], {
    cwd: root,
    encoding: "utf8",
  });
  return listed
    .split("\0")
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => existsSync(join(root, file)) && readFileSync(join(root, file)).includes(0));
}

describe("source files", () => {
  it("hold no raw NUL byte, which makes git treat them as binary and hides their diffs", () => {
    expect(nulOffenders(ROOT)).toEqual([]);
  });

  it("flags tracked files only and skips tracked files missing from the working tree", () => {
    const repo = mkdtempSync(join(tmpdir(), "no-nul-bytes-"));
    try {
      const git = (...args: string[]) => execFileSync("git", args, { cwd: repo });
      git("init", "-q");
      mkdirSync(join(repo, "packages/a/dist"), { recursive: true });
      writeFileSync(join(repo, "packages/a/bad.tsx"), "a\0b");
      writeFileSync(join(repo, "packages/a/good.ts"), "ok");
      writeFileSync(join(repo, "packages/a/gone.ts"), "x\0");
      git("add", "packages");
      unlinkSync(join(repo, "packages/a/gone.ts"));
      writeFileSync(join(repo, "packages/a/dist/out.ts"), "x\0");
      writeFileSync(join(repo, "packages/a/untracked.ts"), "x\0");
      expect(nulOffenders(repo)).toEqual(["packages/a/bad.tsx"]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
