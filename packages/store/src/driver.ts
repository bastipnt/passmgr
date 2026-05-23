/**
 * Platform-agnostic SQL driver interface.
 *
 * Concrete impls live in `./drivers/web.ts` (SQLocal/IndexedDB) and
 * `./drivers/native.ts` (expo-sqlite). The Vault and schema helpers
 * depend only on this interface.
 */
export interface SqlDriver {
  /** Run a parameterized query and return all rows. */
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run a parameterized statement that returns no rows. */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Run fn inside a transaction; the tx receives a driver bound to the same connection. */
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>;
  /** Close the underlying connection. */
  destroy(): Promise<void>;
}
