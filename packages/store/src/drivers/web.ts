import type { TransactionHandle } from "sqlocal";
import { SQLocalDrizzle } from "sqlocal/drizzle";
import type { QueryMethod, QueryResult, SqlDriver } from "../driver";

class SQLocalDriver implements SqlDriver {
  private readonly client: SQLocalDrizzle;
  /** Set on drivers handed out by `transaction`; queries then run inside it. */
  private readonly tx?: TransactionHandle;

  constructor(client: SQLocalDrizzle, tx?: TransactionHandle) {
    this.client = client;
    this.tx = tx;
  }

  async query(sql: string, params: unknown[], method: QueryMethod): Promise<QueryResult> {
    if (!this.tx) return await this.client.driver(sql, params, method);

    // SQLocal runs Drizzle queries in a transaction via `tx.query(drizzleQuery)`:
    // it queues the transaction key and calls the query's `all()`, whose driver
    // call takes that key. Our statement is already compiled, so pass a minimal
    // Drizzle-shaped wrapper. `all()` calls the driver synchronously, so no
    // outside query can take the queued key in between.
    const statement = {
      getSQL: () => undefined,
      toSQL: () => ({ sql, params }),
      all: () => this.client.driver(sql, params, method),
    };
    return (await this.tx.query(statement as never)) as unknown as QueryResult;
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    if (this.tx) throw new Error("nested transactions are not supported");
    // Outside queries wait in SQLocal's worker until the transaction ends.
    return await this.client.transaction((tx) => fn(new SQLocalDriver(this.client, tx)));
  }

  async destroy(): Promise<void> {
    if (!this.tx) await this.client.destroy();
  }
}

export function createWebDriver(databasePath: string = "pass-mgr.sqlite3"): SqlDriver {
  return new SQLocalDriver(new SQLocalDrizzle({ databasePath }));
}
