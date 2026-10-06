import { describe, expect, it, vi } from "vitest";

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
    destroy = async () => undefined;
  },
}));

const { createWebDriver } = await import("../src/drivers/web");

describe("web driver", () => {
  it("answers a get that matched nothing with undefined, in and out of a transaction", async () => {
    const driver = createWebDriver(":memory:");

    expect((await driver.query("SELECT v FROM t WHERE v = 'x'", [], "get")).rows).toBeUndefined();
    expect((await driver.query("SELECT v FROM t", [], "get")).rows).toEqual(["b"]);
    expect((await driver.query("SELECT v FROM t WHERE v = 'x'", [], "all")).rows).toEqual([]);
    await driver.transaction(async (tx) => {
      expect((await tx.query("SELECT v FROM t WHERE v = 'x'", [], "get")).rows).toBeUndefined();
    });
  });
});
