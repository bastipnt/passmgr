import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

/**
 * Stand-in for SQLocal's Drizzle client: like the real one, `driver` answers a
 * `get` that matched nothing with an empty array, not `undefined`.
 */
vi.mock("sqlocal/drizzle", () => ({
  SQLocalDrizzle: class {
    driver = async (sql: string, _params: unknown[], method: string) => ({
      rows: sql.includes("'x'") ? [] : method === "get" ? ["b"] : [["b"]],
    });
    transaction = async (fn: (tx: unknown) => Promise<unknown>) =>
      await fn({ query: async (statement: { all: () => unknown }) => statement.all() });
    destroy = vi.fn(async () => undefined);
    deleteDatabaseFile = vi.fn(async () => undefined);
    constructor(readonly config: { databasePath: string }) {
      clients.push(this as unknown as FakeClient);
    }
  },
}));

type FakeClient = {
  config: { databasePath: string };
  destroy: Mock;
  deleteDatabaseFile: Mock;
};
const clients: FakeClient[] = [];

const getDirectory = vi.fn(async (): Promise<unknown> => ({}));
vi.stubGlobal("navigator", { storage: { getDirectory } });

/** The module checks OPFS once: a fresh import per test. */
async function load() {
  vi.resetModules();
  return await import("../src/drivers/web");
}

beforeEach(() => {
  clients.length = 0;
  getDirectory.mockReset().mockResolvedValue({});
});

describe("web driver", () => {
  it("answers a get that matched nothing with undefined, in and out of a transaction", async () => {
    const { createWebDriver } = await load();
    const driver = createWebDriver("test");

    expect((await driver.query("SELECT v FROM t WHERE v = 'x'", [], "get")).rows).toBeUndefined();
    expect((await driver.query("SELECT v FROM t", [], "get")).rows).toEqual(["b"]);
    expect((await driver.query("SELECT v FROM t WHERE v = 'x'", [], "all")).rows).toEqual([]);
    await driver.transaction(async (tx) => {
      expect((await tx.query("SELECT v FROM t WHERE v = 'x'", [], "get")).rows).toBeUndefined();
    });
  });

  it("opens <name>.sqlite3 and deletes the file, closing the client", async () => {
    const { createWebDriver, isWebStoragePersistent } = await load();
    const driver = createWebDriver("pass-mgr-test");
    await driver.query("SELECT v FROM t", [], "all");

    expect(await isWebStoragePersistent()).toBe(true);
    expect(clients.map((c) => c.config.databasePath)).toEqual(["pass-mgr-test.sqlite3"]);
    await driver.deleteDatabase();
    expect(clients[0]?.deleteDatabaseFile).toHaveBeenCalledWith(undefined, true);
  });

  describe("without OPFS (Firefox private window)", () => {
    beforeEach(() => {
      getDirectory.mockRejectedValue(new DOMException("Security error", "SecurityError"));
    });

    it("keeps one in-memory database per name across close and reopen", async () => {
      const { createWebDriver, isWebStoragePersistent } = await load();
      const first = createWebDriver("pass-mgr-a");
      await first.query("SELECT v FROM t", [], "all");
      await first.destroy();
      await createWebDriver("pass-mgr-a").query("SELECT v FROM t", [], "all");
      await createWebDriver("pass-mgr-b").query("SELECT v FROM t", [], "all");

      expect(await isWebStoragePersistent()).toBe(false);
      expect(clients.map((c) => c.config.databasePath)).toEqual([":memory:", ":memory:"]);
      expect(clients[0]?.destroy).not.toHaveBeenCalled();
      expect(getDirectory).toHaveBeenCalledTimes(1);
    });

    it("drops a deleted database: the name opens empty again", async () => {
      const { createWebDriver } = await load();
      const driver = createWebDriver("pass-mgr-a");
      await driver.query("SELECT v FROM t", [], "all");

      await driver.deleteDatabase();
      await createWebDriver("pass-mgr-a").query("SELECT v FROM t", [], "all");

      expect(clients).toHaveLength(2);
      expect(clients[0]?.destroy).toHaveBeenCalled();
      expect(clients[0]?.deleteDatabaseFile).not.toHaveBeenCalled();
    });
  });
});
