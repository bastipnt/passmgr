import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import type { SqlDriver } from "./driver";

/** Typed Drizzle handle over a SqlDriver (or a transaction-bound one). */
export type LocalDb = SqliteRemoteDatabase;

export function createLocalDb(driver: SqlDriver): LocalDb {
  return drizzle((sql, params, method) => driver.query(sql, params, method));
}
