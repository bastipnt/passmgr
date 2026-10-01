import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from ".";

// Drop every table and the migration log, then apply the migrations from
// scratch. Needed after migrations were squashed into a new baseline, which
// `db:reset` (truncate only) can't recover from. Dev only: refuses anything
// that isn't a local database.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const resetHard = async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!LOCAL_HOSTS.has(url.hostname)) {
    console.error(`Refusing to drop schemas on non-local host "${url.hostname}".`);
    process.exit(1);
  }

  console.log(`Dropping all tables in ${url.hostname}:${url.port}/${url.pathname.slice(1)}...`);
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);

  console.log("Applying migrations...");
  await migrate(db, { migrationsFolder: `${import.meta.dirname}/drizzle` });

  console.log("Done. Run `pnpm db:seed` for the dev user and records.");
  process.exit(0);
};

await resetHard();
