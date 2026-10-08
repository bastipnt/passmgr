import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SqlDriver } from "../src/driver";

/**
 * Stand-in for an expo-sqlite connection, backed by node:sqlite. Every call
 * yields to the event loop first, like the real bridge does, so queries from
 * concurrent callers interleave unless the driver serializes them.
 */
function fakeExpoDatabase(db: DatabaseSync) {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const exec = async (sql: string) => {
    await tick();
    db.exec(sql);
  };

  return {
    prepareAsync: async (sql: string) => {
      await tick();
      const statement = db.prepare(sql);
      return {
        executeAsync: async (params: SQLInputValue[]) => {
          await tick();
          statement.run(...params);
        },
        executeForRawResultAsync: async (params: SQLInputValue[]) => {
          await tick();
          statement.setReturnArrays(true);
          const rows = statement.all(...params);
          return { getAllAsync: async () => rows, getFirstAsync: async () => rows[0] ?? null };
        },
        finalizeAsync: async () => undefined,
      };
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      await exec("BEGIN");
      try {
        await task();
        await exec("COMMIT");
      } catch (e) {
        await exec("ROLLBACK");
        throw e;
      }
    },
    closeAsync: async () => db.close(),
  };
}

let sqlite: DatabaseSync;

const opened: string[] = [];
const deleted: string[] = [];
vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async (name: string) => {
    opened.push(name);
    return fakeExpoDatabase(sqlite);
  },
  deleteDatabaseAsync: async (name: string) => {
    deleted.push(name);
  },
}));

const { createNativeDriver } = await import("../src/drivers/native");

let driver: SqlDriver;

beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:");
  opened.length = 0;
  deleted.length = 0;
  driver = createNativeDriver("pass-mgr-test");
  await driver.query("CREATE TABLE t (v TEXT)", [], "run");
});

const values = async () =>
  (await driver.query("SELECT v FROM t ORDER BY v", [], "values")).rows as [string][];

describe("native driver", () => {
  it("returns positional rows for all/values and a single row for get", async () => {
    await driver.query("INSERT INTO t VALUES (?), (?)", ["a", "b"], "run");

    expect((await driver.query("SELECT v, 1 FROM t ORDER BY v", [], "all")).rows).toEqual([
      ["a", 1],
      ["b", 1],
    ]);
    expect((await driver.query("SELECT v FROM t WHERE v = ?", ["b"], "get")).rows).toEqual(["b"]);
    expect((await driver.query("SELECT v FROM t WHERE v = 'x'", [], "get")).rows).toBeUndefined();
  });

  it("keeps an outside write out of a transaction that rolls back", async () => {
    const tx = driver.transaction(async (t) => {
      await t.query("INSERT INTO t VALUES ('inside')", [], "run");
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error("rollback");
    });
    // Issued while the transaction is open: must neither join it nor be rolled back with it.
    const outside = driver.query("INSERT INTO t VALUES ('outside')", [], "run");

    await expect(tx).rejects.toThrow("rollback");
    await outside;

    expect(await values()).toEqual([["outside"]]);
  });

  it("runs concurrent transactions one after another instead of failing", async () => {
    await Promise.all(
      ["a", "b", "c"].map((v) =>
        driver.transaction(async (t) => {
          await t.query("INSERT INTO t VALUES (?)", [v], "run");
          await t.query("INSERT INTO t VALUES (?)", [`${v}2`], "run");
        }),
      ),
    );

    expect(await values()).toEqual([["a"], ["a2"], ["b"], ["b2"], ["c"], ["c2"]]);
  });

  it("keeps working after a failed query", async () => {
    await expect(driver.query("INSERT INTO missing VALUES (1)", [], "run")).rejects.toThrow();

    await driver.query("INSERT INTO t VALUES ('after')", [], "run");
    expect(await values()).toEqual([["after"]]);
  });

  it("opens <name>.db and deletes it after closing the connection", async () => {
    expect(opened).toEqual(["pass-mgr-test.db"]);
    await driver.deleteDatabase();

    expect(deleted).toEqual(["pass-mgr-test.db"]);
    expect(sqlite.isOpen).toBe(false);
  });

  it("refuses to delete the database from inside a transaction", async () => {
    await expect(driver.transaction((tx) => tx.deleteDatabase())).rejects.toThrow();
    expect(deleted).toEqual([]);
  });
});
