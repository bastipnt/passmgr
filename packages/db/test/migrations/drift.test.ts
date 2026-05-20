import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("migration drift", () => {
  it("running db:generate produces no new migration — schema matches the latest snapshot", () => {
    const pkgRoot = path.resolve(import.meta.dirname, "../..");
    const drizzleDir = path.join(pkgRoot, "drizzle");
    const before = new Set(fs.readdirSync(drizzleDir));

    let stdout = "";
    try {
      stdout = execFileSync(
        "bunx",
        ["drizzle-kit", "generate", "--config", "drizzle.config.ts", "--name=drift-check"],
        {
          cwd: pkgRoot,
          env: {
            ...process.env,
            DATABASE_URL:
              process.env.DATABASE_URL ??
              "postgres://placeholder:placeholder@localhost:5432/placeholder",
          },
          encoding: "utf8",
        },
      );
    } finally {
      // Clean up any migration drizzle-kit may have written.
      const after = fs.readdirSync(drizzleDir);
      for (const entry of after) {
        if (!before.has(entry)) {
          fs.rmSync(path.join(drizzleDir, entry), { recursive: true, force: true });
        }
      }
    }

    expect(stdout, "drizzle-kit emitted a new migration — schema drifted from snapshot").toMatch(
      /No schema changes, nothing to migrate/,
    );
  });
});
