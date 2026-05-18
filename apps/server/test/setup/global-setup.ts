import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "pg";
import * as opaque from "@serenity-kit/opaque";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer | undefined;

export async function setup() {
  // 1) OPAQUE setup secret — registration/login routers read this at module load.
  await opaque.ready;
  process.env.OPAQUE_SERVER_SETUP = opaque.server.createSetup();

  // 2) Spin up Postgres 16. Reused across all test files in this vitest run.
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env.DATABASE_URL = container.getConnectionUri();

  // 3) Apply Drizzle migrations against the container.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const drizzleDir = path.resolve(__dirname, "../../../../packages/db/drizzle");
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
  await container?.stop();
}
