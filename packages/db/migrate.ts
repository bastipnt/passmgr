/**
 * Applies ./drizzle as the database owner, then creates or updates the role the server connects as:
 * login, data access on the app's tables, no DDL, never a superuser. Runs before every deploy
 * (`migrate` service, docker-compose.prod.yml), so the grants cover tables new migrations add.
 *
 *   DATABASE_URL=<owner url> APP_DB_USER=passmgr_app APP_DB_PASSWORD=… bun packages/db/migrate.ts
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL must be set");
const appUser = process.env.APP_DB_USER?.trim();
const appPassword = process.env.APP_DB_PASSWORD;
if (appUser !== undefined && !/^[a-z_][a-z0-9_]{0,62}$/.test(appUser)) {
  throw new Error("APP_DB_USER must be a lower-case Postgres identifier");
}
if (appUser && !appPassword) throw new Error("APP_DB_PASSWORD must be set with APP_DB_USER");

const client = new pg.Client({ connectionString: databaseUrl, options: "-c TimeZone=UTC" });
await client.connect();
try {
  await migrate(drizzle({ client }), {
    migrationsFolder: fileURLToPath(new URL("./drizzle", import.meta.url)),
  });
  console.log("Migrations applied");
  if (appUser && appPassword) await grantAppRole(appUser, appPassword);
} finally {
  await client.end();
}

async function grantAppRole(user: string, password: string) {
  const { rows } = await client.query<{ owner: string; database: string }>(
    "select current_user as owner, current_database() as database",
  );
  const { owner, database } = rows[0];
  // ALTER ROLE below strips superuser: pointed at the owner it would lock out the migrations.
  if (user === owner) throw new Error(`APP_DB_USER must differ from the migrating role (${owner})`);

  const role = client.escapeIdentifier(user);
  await client.query(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ${client.escapeLiteral(user)}) THEN CREATE ROLE ${role}; END IF;
     END $$`,
  );
  await client.query(
    `ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
       PASSWORD ${client.escapeLiteral(scramVerifier(password))}`,
  );
  await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(database)} TO ${role}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
  );
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  console.log(`Role ${user} granted data access`);
}

/** The SCRAM-SHA-256 verifier Postgres stores, so the password itself is never in a statement (logs). */
function scramVerifier(password: string, iterations = 4096) {
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const hmac = (label: string) => createHmac("sha256", salted).update(label).digest();
  const storedKey = createHash("sha256").update(hmac("Client Key")).digest("base64");
  const serverKey = hmac("Server Key").toString("base64");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey}:${serverKey}`;
}
