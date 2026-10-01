import { openDatabaseAsync, type SQLiteBindParams, type SQLiteDatabase } from "expo-sqlite";
import type { QueryMethod, QueryResult, SqlDriver } from "../driver";
import { createLock, type Lock } from "../lock";

async function execute(
  db: SQLiteDatabase,
  sql: string,
  params: unknown[],
  method: QueryMethod,
): Promise<QueryResult> {
  const statement = await db.prepareAsync(sql);
  const bind = params as SQLiteBindParams;
  try {
    if (method === "run") {
      await statement.executeAsync(bind);
      return { rows: [] };
    }
    // Raw results are positional arrays, as Drizzle's sqlite-proxy expects.
    const result = await statement.executeForRawResultAsync(bind);
    if (method === "get") {
      return { rows: ((await result.getFirstAsync()) ?? undefined) as unknown as unknown[] };
    }
    return { rows: await result.getAllAsync() };
  } finally {
    await statement.finalizeAsync();
  }
}

/**
 * One connection, with every query and transaction serialized through a lock.
 * That is what isolates transactions: `withTransactionAsync` alone would let
 * queries issued meanwhile run inside it, and `withExclusiveTransactionAsync`
 * opens a second connection whose write lock makes other writes fail with
 * "database is locked" (expo-sqlite sets no busy timeout).
 */
class ExpoSqliteDriver implements SqlDriver {
  private readonly opening: Promise<SQLiteDatabase>;
  private readonly lock: Lock;
  /** Set on drivers handed out by `transaction`; they already hold the lock. */
  private readonly bound?: SQLiteDatabase;

  constructor(opening: Promise<SQLiteDatabase>, lock: Lock, bound?: SQLiteDatabase) {
    this.opening = opening;
    this.lock = lock;
    this.bound = bound;
  }

  async query(sql: string, params: unknown[], method: QueryMethod): Promise<QueryResult> {
    if (this.bound) return await execute(this.bound, sql, params, method);
    return await this.lock(async () => execute(await this.opening, sql, params, method));
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    if (this.bound) throw new Error("nested transactions are not supported");
    return await this.lock(async () => {
      const db = await this.opening;
      let result!: T;
      await db.withTransactionAsync(async () => {
        result = await fn(new ExpoSqliteDriver(this.opening, this.lock, db));
      });
      return result;
    });
  }

  async destroy(): Promise<void> {
    if (this.bound) return;
    await this.lock(async () => (await this.opening).closeAsync());
  }
}

export function createNativeDriver(databaseName: string = "pass-mgr.db"): SqlDriver {
  return new ExpoSqliteDriver(openDatabaseAsync(databaseName), createLock());
}
