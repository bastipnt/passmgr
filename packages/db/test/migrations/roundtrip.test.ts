import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("migration round-trip", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("every migration file applies cleanly on a fresh schema", async () => {
    // Drop and recreate the public schema, then re-apply every migration sequentially.
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");

    const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");
    const migrationDirs = fs
      .readdirSync(drizzleDir)
      .filter((d) => fs.statSync(path.join(drizzleDir, d)).isDirectory())
      .sort();

    expect(migrationDirs.length).toBeGreaterThan(0);

    for (const mig of migrationDirs) {
      const sqlPath = path.join(drizzleDir, mig, "migration.sql");
      const sql = fs.readFileSync(sqlPath, "utf8");
      for (const raw of sql.split("--> statement-breakpoint")) {
        const stmt = raw.trim();
        if (stmt) await client.query(stmt);
      }
    }

    // Sanity: the three tables exist after replay.
    const tables = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    expect(tables.rows.map((r) => r.tablename)).toEqual(["keys", "records", "users"]);
  });
});
