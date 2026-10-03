import type { SqlDriver } from "./driver";
import { GENERATED_MIGRATIONS } from "./migrations.generated";

/**
 * One forward-only schema step. `up` runs inside a transaction together with
 * the `user_version` bump, so a failed migration leaves the database untouched.
 *
 * Steps come from drizzle-kit (`pnpm migrations:generate`) and are frozen once
 * merged: change `src/schema/tables.ts` and generate a new one instead.
 */
export type Migration = {
  version: number;
  name: string;
  up: (tx: SqlDriver) => Promise<void>;
};

export class SchemaTooNewError extends Error {
  readonly databaseVersion: number;
  readonly supportedVersion: number;

  constructor(databaseVersion: number, supportedVersion: number) {
    super(
      `Local database is at schema version ${databaseVersion}, this app supports up to ${supportedVersion}`,
    );
    this.name = "SchemaTooNewError";
    this.databaseVersion = databaseVersion;
    this.supportedVersion = supportedVersion;
  }
}

/**
 * Tables created by the bootstrap that predates migrations. Only a version-0
 * database can hold them; it is a disposable cache (no users yet, ADR 0001),
 * so it is rebuilt rather than adopted.
 */
const PRE_MIGRATION_TABLES = ["records", "key_material", "sync_meta"];

async function runStatements(tx: SqlDriver, statements: readonly string[]) {
  for (const statement of statements) {
    await tx.query(statement, [], "run");
  }
}

export const MIGRATIONS: readonly Migration[] = GENERATED_MIGRATIONS.map(
  ({ name, statements }, i) => ({
    version: i + 1,
    name,
    up: async (tx) => {
      if (i === 0) {
        await runStatements(
          tx,
          PRE_MIGRATION_TABLES.map((table) => `DROP TABLE IF EXISTS \`${table}\``),
        );
      }
      await runStatements(tx, statements);
    },
  }),
);

async function getUserVersion(db: SqlDriver): Promise<number> {
  const { rows } = await db.query("PRAGMA user_version", [], "get");
  return Number(rows[0] ?? 0);
}

function assertContiguous(migrations: readonly Migration[]) {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migration "${m.name}" has version ${m.version}, expected ${i + 1}`);
    }
  });
}

/** SQLite lock contention, as reported by sqlite-wasm, expo-sqlite and node:sqlite. */
function isBusyError(error: unknown): boolean {
  return (
    error instanceof Error && /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(error.message)
  );
}

export type MigrateOptions = {
  /** Attempts per migration when another connection holds the lock. */
  busyAttempts?: number;
  /** Base delay between attempts; grows linearly. */
  busyDelayMs?: number;
};

/**
 * Bring the database up to the latest schema version, tracked in SQLite's
 * `PRAGMA user_version`. Each migration commits on its own.
 *
 * Two connections may migrate at once (e.g. two browser tabs on the same OPFS
 * file). Transactions start deferred, so both can read the old version and the
 * second one fails with a busy error at its first write. That step is retried,
 * and the version is re-read inside the new transaction, so it is skipped once
 * the other connection has applied it.
 *
 * @throws SchemaTooNewError when the database was written by a newer app version
 */
export async function migrate(
  db: SqlDriver,
  migrations: readonly Migration[] = MIGRATIONS,
  { busyAttempts = 5, busyDelayMs = 50 }: MigrateOptions = {},
): Promise<void> {
  assertContiguous(migrations);
  const latest = migrations.length;

  const current = await getUserVersion(db);
  if (current > latest) throw new SchemaTooNewError(current, latest);

  for (const migration of migrations.slice(current)) {
    for (let attempt = 1; ; attempt++) {
      try {
        await db.transaction(async (tx) => {
          if ((await getUserVersion(tx)) >= migration.version) return;
          await migration.up(tx);
          // PRAGMA doesn't take bound parameters; the version is a checked integer.
          await tx.query(`PRAGMA user_version = ${migration.version}`, [], "run");
        });
        break;
      } catch (error) {
        if (!isBusyError(error) || attempt >= busyAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, busyDelayMs * attempt));
      }
    }
  }
}
