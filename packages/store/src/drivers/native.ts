import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import type { SqlDriver } from "../driver";

class ExpoSqliteDriver implements SqlDriver {
  private opening: Promise<SQLiteDatabase>;
  /** Set when inside an active transaction so nested calls hit the same connection. */
  private readonly bound?: SQLiteDatabase;

  constructor(opening: Promise<SQLiteDatabase> | SQLiteDatabase, bound?: SQLiteDatabase) {
    this.opening = opening instanceof Promise ? opening : Promise.resolve(opening);
    this.bound = bound;
  }

  private async conn(): Promise<SQLiteDatabase> {
    return this.bound ?? (await this.opening);
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await this.conn();
    return (await db.getAllAsync(sql, params as never)) as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    const db = await this.conn();
    await db.runAsync(sql, params as never);
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    if (this.bound) throw new Error("nested transactions are not supported");
    const db = await this.conn();
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await fn(new ExpoSqliteDriver(db, db));
    });
    return result;
  }

  async destroy(): Promise<void> {
    if (this.bound) return;
    const db = await this.opening;
    await db.closeAsync();
  }
}

export function createNativeDriver(databaseName: string = "pass-mgr.db"): SqlDriver {
  return new ExpoSqliteDriver(openDatabaseAsync(databaseName));
}
