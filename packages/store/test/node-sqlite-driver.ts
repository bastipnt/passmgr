import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { QueryMethod, QueryResult, SqlDriver } from "../src/driver";

/**
 * In-memory SqlDriver for tests, backed by Node's built-in SQLite. Mirrors the
 * app drivers' contract: array rows, one connection, no nested transactions.
 */
class NodeSqliteDriver implements SqlDriver {
  private readonly db: DatabaseSync;
  private readonly inTransaction: boolean;

  constructor(db: DatabaseSync, inTransaction = false) {
    this.db = db;
    this.inTransaction = inTransaction;
  }

  async query(sql: string, params: unknown[], method: QueryMethod): Promise<QueryResult> {
    const statement = this.db.prepare(sql);
    const bind = params as SQLInputValue[];
    if (method === "run") {
      statement.run(...bind);
      return { rows: [] };
    }
    statement.setReturnArrays(true);
    if (method === "get") return { rows: statement.get(...bind) as unknown as unknown[] };
    return { rows: statement.all(...bind) };
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    if (this.inTransaction) throw new Error("nested transactions are not supported");
    this.db.exec("BEGIN");
    try {
      const result = await fn(new NodeSqliteDriver(this.db, true));
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  async destroy(): Promise<void> {
    if (!this.inTransaction) this.db.close();
  }
}

export function createTestDriver(): SqlDriver {
  return new NodeSqliteDriver(new DatabaseSync(":memory:"));
}
