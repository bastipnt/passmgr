import type { TransactionHandle } from "sqlocal";
import { SQLocalDrizzle } from "sqlocal/drizzle";
import type { QueryMethod, QueryResult, SqlDriver } from "../driver";

let opfs: Promise<boolean> | undefined;

/**
 * Whether databases persist in OPFS. Firefox private windows (and some
 * embedded browsers) refuse `navigator.storage.getDirectory()`; there the
 * databases live in memory until the page closes.
 */
export function isWebStoragePersistent(): Promise<boolean> {
  opfs ??= (async () => {
    try {
      await navigator.storage.getDirectory();
      return true;
    } catch {
      return false;
    }
  })();
  return opfs;
}

/**
 * The in-memory databases without OPFS, by name. Each memory client is its
 * own database, so a name keeps its client for the page's lifetime: closing
 * a profile (a switch) must not lose it. Only `deleteDatabase` drops one.
 */
const memoryDatabases = new Map<string, SQLocalDrizzle>();

type Client = { client: SQLocalDrizzle; inMemory: boolean };

async function openClient(name: string): Promise<Client> {
  if (await isWebStoragePersistent()) {
    return { client: new SQLocalDrizzle({ databasePath: `${name}.sqlite3` }), inMemory: false };
  }
  let client = memoryDatabases.get(name);
  if (!client) {
    // `:memory:` runs on the main thread: no worker that tries OPFS and logs its failure.
    client = new SQLocalDrizzle({ databasePath: ":memory:" });
    memoryDatabases.set(name, client);
  }
  return { client, inMemory: true };
}

class SQLocalDriver implements SqlDriver {
  private readonly name: string;
  private opened?: Promise<Client>;
  /** Set on drivers handed out by `transaction`; queries then run inside it. */
  private readonly tx?: { client: SQLocalDrizzle; handle: TransactionHandle };

  constructor(name: string, tx?: { client: SQLocalDrizzle; handle: TransactionHandle }) {
    this.name = name;
    this.tx = tx;
  }

  /** Opened on first use: where depends on the async OPFS check. */
  private open(): Promise<Client> {
    this.opened ??= openClient(this.name);
    return this.opened;
  }

  async query(sql: string, params: unknown[], method: QueryMethod): Promise<QueryResult> {
    const result = await this.run(sql, params, method);
    // SQLocal answers a `get` that matched nothing with `[]`, which Drizzle maps
    // to a row of undefined columns; the contract (and Drizzle) want `undefined`.
    if (method === "get" && Array.isArray(result.rows) && result.rows.length === 0) {
      return { rows: undefined as unknown as unknown[] };
    }
    return result;
  }

  private async run(sql: string, params: unknown[], method: QueryMethod): Promise<QueryResult> {
    if (!this.tx) return await (await this.open()).client.driver(sql, params, method);
    const { client, handle } = this.tx;

    // SQLocal runs Drizzle queries in a transaction via `tx.query(drizzleQuery)`:
    // it queues the transaction key and calls the query's `all()`, whose driver
    // call takes that key. Our statement is already compiled, so pass a minimal
    // Drizzle-shaped wrapper. `all()` calls the driver synchronously, so no
    // outside query can take the queued key in between.
    const statement = {
      getSQL: () => undefined,
      toSQL: () => ({ sql, params }),
      all: () => client.driver(sql, params, method),
    };
    return (await handle.query(statement as never)) as unknown as QueryResult;
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    if (this.tx) throw new Error("nested transactions are not supported");
    // Outside queries wait in SQLocal's worker until the transaction ends.
    const { client } = await this.open();
    return await client.transaction((handle) =>
      fn(new SQLocalDriver(this.name, { client, handle })),
    );
  }

  async destroy(): Promise<void> {
    if (this.tx || !this.opened) return;
    const { client, inMemory } = await this.opened;
    // A memory database is gone once closed: it stays for the next open.
    if (!inMemory) await client.destroy();
  }

  async deleteDatabase(): Promise<void> {
    if (this.tx) throw new Error("can't delete the database inside a transaction");
    const { client, inMemory } = await this.open();
    if (inMemory) {
      memoryDatabases.delete(this.name);
      await client.destroy();
      return;
    }
    // `destroy: true` also closes the client: nothing reopens the file.
    await client.deleteDatabaseFile(undefined, true);
  }
}

/**
 * `name` without extension: the OPFS file is `<name>.sqlite3`. Without OPFS
 * (see `isWebStoragePersistent`) it's an in-memory database of that name.
 */
export function createWebDriver(name: string): SqlDriver {
  return new SQLocalDriver(name);
}
