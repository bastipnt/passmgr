import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let pgContainer: StartedPostgreSqlContainer | undefined;

export async function setup() {
  pgContainer = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env.DATABASE_URL = pgContainer.getConnectionUri();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");
    const migrationDirs = fs
      .readdirSync(drizzleDir)
      .filter((d) => fs.statSync(path.join(drizzleDir, d)).isDirectory())
      .sort();

    for (const mig of migrationDirs) {
      const sqlPath = path.join(drizzleDir, mig, "migration.sql");
      const sql = fs.readFileSync(sqlPath, "utf8");
      for (const raw of sql.split("--> statement-breakpoint")) {
        const stmt = raw.trim();
        if (stmt) await client.query(stmt);
      }
    }
  } finally {
    await client.end();
  }
}

export async function teardown() {
  await pgContainer?.stop();
}
