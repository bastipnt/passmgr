import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "pg";
import * as opaque from "@serenity-kit/opaque";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, type StartedTestContainer } from "testcontainers";

let pgContainer: StartedPostgreSqlContainer | undefined;
let redisContainer: StartedTestContainer | undefined;

export async function setup() {
  await opaque.ready;
  process.env.OPAQUE_SERVER_SETUP = opaque.server.createSetup();

  [pgContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer("postgres:16-alpine").start(),
    new GenericContainer("redis:7-alpine").withExposedPorts(6379).start(),
  ]);

  process.env.DATABASE_URL = pgContainer.getConnectionUri();
  process.env.REDIS_HOST = redisContainer.getHost();
  process.env.REDIS_PORT = String(redisContainer.getMappedPort(6379));

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
  await Promise.all([pgContainer?.stop(), redisContainer?.stop()]);
}
