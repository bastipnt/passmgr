import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { OpenDatabase, QueryMethod, QueryResult, SqlDriver } from "../src/driver";

/**
 * In-memory SqlDriver for tests, backed by Node's built-in SQLite. Mirrors the
 * app drivers' contract: array rows, one connection, no nested transactions.
 */
class NodeSqliteDriver implements SqlDriver {
  private readonly db: DatabaseSync;
  private readonly inTransaction: boolean;

  private readonly onDelete?: () => void;

  constructor(db: DatabaseSync, inTransaction = false, onDelete?: () => void) {
    this.db = db;
    this.inTransaction = inTransaction;
    this.onDelete = onDelete;
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
    if (!this.inTransaction && this.db.isOpen) this.db.close();
  }

  async deleteDatabase(): Promise<void> {
    if (this.inTransaction) throw new Error("can't delete the database inside a transaction");
    await this.destroy();
    this.onDelete?.();
  }
}

export function createTestDriver(): SqlDriver {
  return new NodeSqliteDriver(new DatabaseSync(":memory:"));
}

/**
 * Named in-memory databases, like files on a device: opening a name again sees
 * what was written before (until `deleteDatabase`). `names()` lists the
 * databases that exist.
 */
export function createTestDatabases(): { open: OpenDatabase; names: () => string[] } {
  const files = new Map<string, string>();
  const dir = mkdtempSync(join(tmpdir(), "passmgr-store-"));

  const open: OpenDatabase = (name) => {
    const path = join(dir, `${name}.sqlite3`);
    files.set(name, path);
    return new NodeSqliteDriver(new DatabaseSync(path), false, () => {
      rmSync(path, { force: true });
      files.delete(name);
    });
  };
  return { open, names: () => [...files.keys()].sort() };
}
