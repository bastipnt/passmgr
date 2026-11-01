import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SqlDriver } from "../../src/driver";
import { createWebDriver, isWebStoragePersistent } from "../../src/drivers/web";
import { MIGRATIONS, migrate } from "../../src/migrations";

let driver: SqlDriver;

beforeAll(async () => {
  // Without OPFS the driver falls back to memory: this suite targets the worker.
  expect(await isWebStoragePersistent()).toBe(true);
});

async function openTable(): Promise<SqlDriver> {
  driver = createWebDriver(`store-browser-test-${crypto.randomUUID()}`);
  await driver.query("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)", [], "run");
  return driver;
}

async function values(db: SqlDriver): Promise<string[]> {
  const { rows } = await db.query("SELECT v FROM t ORDER BY id", [], "values");
  return (rows as [string][]).map(([v]) => v);
}

const insert = (db: SqlDriver, v: string) => db.query("INSERT INTO t (v) VALUES (?)", [v], "run");

afterEach(async () => {
  await driver.deleteDatabase();
});

describe("web driver on SQLocal", () => {
  it("commits a transaction", async () => {
    const db = await openTable();

    await db.transaction(async (tx) => {
      await insert(tx, "a");
      await insert(tx, "b");
    });

    expect(await values(db)).toEqual(["a", "b"]);
  });

  it("rolls back a transaction that throws", async () => {
    const db = await openTable();
    await insert(db, "kept");

    await expect(
      db.transaction(async (tx) => {
        await insert(tx, "dropped");
        expect(await values(tx)).toEqual(["kept", "dropped"]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await values(db)).toEqual(["kept"]);
  });

  it("keeps an outside write out of an open transaction", async () => {
    const db = await openTable();
    let outside: Promise<unknown> | undefined;

    await expect(
      db.transaction(async (tx) => {
        await insert(tx, "inside");
        outside = insert(db, "outside");
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(await values(tx)).toEqual(["inside"]);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    await outside;

    expect(await values(db)).toEqual(["outside"]);
  });

  it("returns array rows inside a transaction, like outside", async () => {
    const db = await openTable();
    await insert(db, "a");
    await insert(db, "b");

    const outside = {
      all: (await db.query("SELECT id, v FROM t ORDER BY id", [], "all")).rows,
      get: (await db.query("SELECT id, v FROM t WHERE v = ?", ["b"], "get")).rows,
    };
    const inside = await db.transaction(async (tx) => ({
      all: (await tx.query("SELECT id, v FROM t ORDER BY id", [], "all")).rows,
      values: (await tx.query("SELECT id, v FROM t ORDER BY id", [], "values")).rows,
      get: (await tx.query("SELECT id, v FROM t WHERE v = ?", ["b"], "get")).rows,
      none: (await tx.query("SELECT id, v FROM t WHERE v = ?", ["x"], "get")).rows,
    }));

    expect(inside.all).toEqual([
      [1, "a"],
      [2, "b"],
    ]);
    expect(inside.values).toEqual(inside.all);
    expect(inside.get).toEqual([2, "b"]);
    expect(inside.none).toBeUndefined();
    expect(outside).toEqual({ all: inside.all, get: inside.get });
  });

  it("applies every migration", async () => {
    driver = createWebDriver(`store-browser-test-${crypto.randomUUID()}`);

    await migrate(driver);

    const { rows } = await driver.query("PRAGMA user_version", [], "get");
    expect(Number(rows[0])).toBe(MIGRATIONS.length);
  });
});
