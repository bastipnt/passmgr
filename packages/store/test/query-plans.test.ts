import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlDriver } from "../src/driver";
import { createLocalDb, type LocalDb } from "../src/local-db";
import { migrate } from "../src/migrations";
import { getPendingUnderOldKeys, rebasePendingVersions } from "../src/schema/outbox-schema";
import { getAllRecordsLatest, getDeletedRecords } from "../src/schema/records-schema";
import { createTestDriver } from "./node-sqlite-driver";

/**
 * The record queries run on every sync or list render must use the indexes of `tables.ts`, checked on the
 * plans SQLite picks for what Drizzle sends; see packages/store/CLAUDE.md.
 */
let driver: SqlDriver;
let sent: { sql: string; params: unknown[] }[];
let db: LocalDb;

beforeEach(async () => {
  driver = createTestDriver();
  await migrate(driver);
  sent = [];
  db = createLocalDb({
    ...driver,
    query: (sql, params, method) => {
      sent.push({ sql, params });
      return driver.query(sql, params, method);
    },
  });
});

afterEach(async () => {
  await driver.destroy();
});

async function plansOf(run: () => Promise<unknown>): Promise<string[]> {
  sent = [];
  await run();
  const plans: string[] = [];
  for (const { sql, params } of sent) {
    const { rows } = await driver.query(`EXPLAIN QUERY PLAN ${sql}`, params, "all");
    plans.push((rows as unknown[][]).map((row) => String(row[3])).join("\n"));
  }
  return plans;
}

describe("query plans", () => {
  it.each([
    ["getPendingUnderOldKeys", () => getPendingUnderOldKeys(db)],
    ["rebasePendingVersions", () => rebasePendingVersions([], db)],
  ])("%s reads the pending versions through the partial index", async (_, run) => {
    const [plan] = await plansOf(run);

    expect(plan).toMatch(/SCAN records USING INDEX records_pending_idx/);
  });

  it.each([
    ["getAllRecordsLatest", () => getAllRecordsLatest(db)],
    ["getAllRecordsLatest of a vault", () => getAllRecordsLatest(db, "v-personal")],
    ["getDeletedRecords", () => getDeletedRecords(db)],
  ])("%s finds the latest versions from the index alone", async (_, run) => {
    const [plan] = await plansOf(run);

    expect(plan).toMatch(/SCAN records USING COVERING INDEX records_latest_idx/);
  });
});
