import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectMigrations, renderModule } from "../scripts/bundle-migrations";
import type { SqlDriver } from "../src/driver";
import { MIGRATIONS, type Migration, migrate, SchemaTooNewError } from "../src/migrations";
import { Vault } from "../src/vault";
import { createTestDriver } from "./node-sqlite-driver";

let db: SqlDriver;

beforeEach(() => {
  db = createTestDriver();
});

afterEach(async () => {
  await db.destroy();
});

const run = (sql: string) => db.query(sql, [], "run");

async function userVersion(): Promise<number> {
  const { rows } = await db.query("PRAGMA user_version", [], "get");
  return Number(rows[0]);
}

async function tableNames(): Promise<string[]> {
  const { rows } = await db.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    [],
    "values",
  );
  return (rows as [string][]).map(([name]) => name);
}

function createTable(version: number, table: string): Migration {
  return {
    version,
    name: `create ${table}`,
    up: async (tx) => {
      await tx.query(`CREATE TABLE ${table} (id INTEGER)`, [], "run");
    },
  };
}

describe("migrate", () => {
  it("applies all migrations to a fresh database and records the version", async () => {
    await migrate(db, [createTable(1, "a"), createTable(2, "b")]);

    expect(await userVersion()).toBe(2);
    expect(await tableNames()).toEqual(["a", "b"]);
  });

  it("only applies migrations newer than the stored version", async () => {
    await migrate(db, [createTable(1, "a")]);
    // Re-running version 1 would fail: table "a" already exists.
    await migrate(db, [createTable(1, "a"), createTable(2, "b")]);

    expect(await userVersion()).toBe(2);
    expect(await tableNames()).toEqual(["a", "b"]);
  });

  it("is a no-op when the database is already current", async () => {
    await migrate(db, [createTable(1, "a")]);
    await migrate(db, [createTable(1, "a")]);

    expect(await userVersion()).toBe(1);
  });

  it("rolls back a failing migration and keeps earlier ones committed", async () => {
    const failing: Migration = {
      version: 2,
      name: "half done",
      up: async (tx) => {
        await tx.query("CREATE TABLE b (id INTEGER)", [], "run");
        throw new Error("boom");
      },
    };

    await expect(migrate(db, [createTable(1, "a"), failing])).rejects.toThrow("boom");

    expect(await userVersion()).toBe(1);
    expect(await tableNames()).toEqual(["a"]);
  });

  it("refuses a database written by a newer app version", async () => {
    await run("PRAGMA user_version = 5");

    await expect(migrate(db, [createTable(1, "a")])).rejects.toBeInstanceOf(SchemaTooNewError);
    expect(await tableNames()).toEqual([]);
  });

  it("retries a migration that hit a busy lock", async () => {
    let calls = 0;
    const contended: Migration = {
      version: 1,
      name: "contended",
      up: async (tx) => {
        calls++;
        if (calls === 1) throw new Error("SQLITE_BUSY: database is locked");
        await tx.query("CREATE TABLE a (id INTEGER)", [], "run");
      },
    };

    await migrate(db, [contended], { busyDelayMs: 0 });

    expect(calls).toBe(2);
    expect(await userVersion()).toBe(1);
  });

  it("skips a step another connection applied while this one waited", async () => {
    let calls = 0;
    const appliedElsewhere: Migration = {
      version: 1,
      name: "raced",
      up: async () => {
        calls++;
        // Our write hits the other connection's lock. It commits version 1
        // after our rollback, before our retry (which waits busyDelayMs).
        setTimeout(() => void run("PRAGMA user_version = 1"), 0);
        throw new Error("database is locked");
      },
    };

    await migrate(db, [appliedElsewhere, createTable(2, "b")], { busyDelayMs: 20 });

    expect(calls).toBe(1);
    expect(await userVersion()).toBe(2);
    expect(await tableNames()).toEqual(["b"]);
  });

  it("gives up after the configured attempts and doesn't retry other errors", async () => {
    let busyCalls = 0;
    const alwaysBusy: Migration = {
      version: 1,
      name: "always busy",
      up: async () => {
        busyCalls++;
        throw new Error("database is locked");
      },
    };
    await expect(migrate(db, [alwaysBusy], { busyAttempts: 3, busyDelayMs: 0 })).rejects.toThrow(
      "database is locked",
    );
    expect(busyCalls).toBe(3);

    let failCalls = 0;
    const broken: Migration = {
      version: 1,
      name: "broken",
      up: async () => {
        failCalls++;
        throw new Error("syntax error");
      },
    };
    await expect(migrate(db, [broken], { busyDelayMs: 0 })).rejects.toThrow("syntax error");
    expect(failCalls).toBe(1);
  });

  it("rejects a migration list with gaps or wrong order", async () => {
    await expect(migrate(db, [createTable(1, "a"), createTable(3, "c")])).rejects.toThrow(
      'Migration "create c" has version 3, expected 2',
    );
    expect(await userVersion()).toBe(0);
  });
});

describe("MIGRATIONS", () => {
  it("creates the vault tables", async () => {
    await migrate(db);

    expect(await userVersion()).toBe(MIGRATIONS.length);
    expect(await tableNames()).toEqual(["key_material", "records", "sync_meta", "vaults"]);
  });

  it("rebuilds a database created by the pre-migration bootstrap", async () => {
    // What `Vault.init()` used to create. It's a disposable cache (ADR 0001).
    await run("CREATE TABLE key_material (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    await run("INSERT INTO key_material (key, value) VALUES ('email', 'a@b.c')");

    await migrate(db);

    expect(await userVersion()).toBe(MIGRATIONS.length);
    expect((await db.query("SELECT * FROM key_material", [], "all")).rows).toEqual([]);
  });

  it("bundled module matches the drizzle-kit output (run `pnpm migrations:generate`)", () => {
    const root = join(import.meta.dirname, "..");
    const bundled = readFileSync(join(root, "src/migrations.generated.ts"), "utf8");

    expect(bundled).toBe(renderModule(collectMigrations(join(root, "drizzle"))));
  });
});

describe("Vault", () => {
  it("migrates on construction before serving queries", async () => {
    const vault = new Vault(db);

    await vault.setLastSyncTimestamp("2026-10-01T00:00:00.000Z");

    expect(await vault.getLastSyncTimestamp()).toBe("2026-10-01T00:00:00.000Z");
    expect(await userVersion()).toBe(MIGRATIONS.length);
  });

  it("retries initialization on the next call after a failed migration", async () => {
    // Stays failing until released, outlasting migrate's own busy retries.
    let failing = true;
    const flaky: SqlDriver = {
      query: (sql, params, method) =>
        failing ? Promise.reject(new Error("disk I/O error")) : db.query(sql, params, method),
      transaction: (fn) => db.transaction(fn),
      destroy: () => db.destroy(),
    };
    const vault = new Vault(flaky);

    await expect(vault.getLastSyncTimestamp()).rejects.toThrow("disk I/O error");

    failing = false;
    expect(await vault.getLastSyncTimestamp()).toBeNull();
    expect(await userVersion()).toBe(MIGRATIONS.length);
  });
});
