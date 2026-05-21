import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { OpaqueID, getOpaqueConfig } from "@cloudflare/opaque-ts";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, type StartedTestContainer } from "testcontainers";

let pgContainer: StartedPostgreSqlContainer | undefined;
let redisContainer: StartedTestContainer | undefined;

export async function setup() {
  const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);
  const oprfSeed = crypto.getRandomValues(new Uint8Array(cfg.hash.Nh));
  const ake = await cfg.ake.generateAuthKeyPair();
  process.env.OPAQUE_OPRF_SEED = Buffer.from(oprfSeed).toString("base64");
  process.env.OPAQUE_AKE_PRIVATE_KEY = Buffer.from(Uint8Array.from(ake.private_key)).toString(
    "base64",
  );
  // Still required by apps/server/src/opaque.ts as the email HMAC/encryption key.
  // Independent of the OPAQUE protocol — any stable secret works.
  process.env.OPAQUE_SERVER_SETUP = randomBytes(32).toString("base64");

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
