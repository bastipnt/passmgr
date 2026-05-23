import { SQLocal } from "sqlocal";
import type { TransactionHandle } from "sqlocal";
import type { SqlDriver } from "../driver";

/** Underlying connection: top-level SQLocal or a tx handle from `SQLocal.transaction`. */
type SqlocalConn = SQLocal | TransactionHandle;

class SQLocalDriver implements SqlDriver {
  private readonly conn: SqlocalConn;

  constructor(conn: SqlocalConn) {
    this.conn = conn;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const rows = await this.conn.sql<Record<string, unknown>>(sql, ...params);
    return rows as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.conn.sql(sql, ...params);
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    if (!isTopLevel(this.conn)) throw new Error("nested transactions are not supported");
    return await this.conn.transaction(async (tx) => fn(new SQLocalDriver(tx)));
  }

  async destroy(): Promise<void> {
    if (isTopLevel(this.conn)) await this.conn.destroy();
  }
}

function isTopLevel(conn: SqlocalConn): conn is SQLocal {
  return conn instanceof SQLocal;
}

export function createWebDriver(databasePath: string = "pass-mgr.sqlite3"): SqlDriver {
  return new SQLocalDriver(new SQLocal({ databasePath }));
}
