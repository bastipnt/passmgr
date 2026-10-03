/** How Drizzle's sqlite-proxy wants a statement executed (and its result shaped). */
export type QueryMethod = "run" | "all" | "values" | "get";

/**
 * Rows are positional arrays in column order (never objects: a join selecting
 * two same-named columns would collapse them). For `get` it is the single row
 * itself, or `undefined` when nothing matched; for `run` it is empty.
 */
export type QueryResult = { rows: unknown[] };

/**
 * Platform-agnostic SQL driver interface.
 *
 * Concrete impls live in `./drivers/web.ts` (SQLocal/OPFS) and
 * `./drivers/native.ts` (expo-sqlite). The Vault talks to it through Drizzle's
 * sqlite-proxy (`./local-db.ts`) and the migration runner.
 */
export interface SqlDriver {
  query(sql: string, params: unknown[], method: QueryMethod): Promise<QueryResult>;
  /**
   * Run fn inside a transaction, isolated from queries issued outside of it.
   * The tx driver is bound to the transaction; never use Drizzle's own
   * `db.transaction()`, which can't isolate anything over a proxy.
   */
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>;
  /** Close the underlying connection. */
  destroy(): Promise<void>;
}
