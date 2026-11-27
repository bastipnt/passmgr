type Request<T> = { id: number; request: T };
type Reply = { id: number; result: unknown } | { id: number; error: string };

type Pending = { resolve: (result: unknown) => void; reject: (error: Error) => void };

/** Node (tests, scripts) has no `Worker`: there the work runs in-thread. */
export function hasWorker(): boolean {
  return typeof Worker !== "undefined";
}

export function runOffThread<T>(
  offThread: () => Promise<T>,
  inThread: () => T | Promise<T>,
): Promise<T> {
  if (!hasWorker()) return Promise.resolve().then(inThread);
  return offThread();
}

/** One lazily started worker; replies find their call by `id` (the worker runs `serveOffThread`). */
export class WorkerClient {
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly start: () => Worker;
  private readonly name: string;
  private readonly serial: boolean;
  private readonly onFailure: ((error: Error) => void) | undefined;

  /** `onFailure`: a worker error, also one with no call waiting (not `terminate`). */
  constructor(
    start: () => Worker,
    name: string,
    options: { serial?: boolean; onFailure?: (error: Error) => void } = {},
  ) {
    this.start = start;
    this.name = name;
    this.serial = options.serial ?? false;
    this.onFailure = options.onFailure;
  }

  request<T>(request: unknown, transfer: Transferable[] = []): Promise<T> {
    if (!this.serial) return this.post<T>(request, transfer);
    const result = this.queue.then(() => this.post<T>(request, transfer));
    this.queue = result.catch(() => {});
    return result;
  }

  get started(): boolean {
    return this.worker !== null;
  }

  /** Rejects every waiting call but keeps the worker (and what it holds) running. */
  cancel(error: Error): void {
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }

  terminate(error = new Error(`${this.name} terminated`)): void {
    this.worker?.terminate();
    this.worker = null;
    this.cancel(error);
  }

  private post<T>(request: unknown, transfer: Transferable[]): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (result: unknown) => void, reject });
      const message: Request<unknown> = { id, request };
      this.getWorker().postMessage(message, transfer);
    });
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = this.start();
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data;
      const entry = this.pending.get(reply.id);
      if (!entry) return;
      this.pending.delete(reply.id);
      if ("error" in reply) entry.reject(new Error(reply.error));
      else entry.resolve(reply.result);
    };
    // E.g. the worker script can't be fetched (offline, not yet cached): without this the calls
    // never settle. Fail what's waiting and drop the worker so the next call retries.
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      const error = new Error(`${this.name} failed: ${event.message || "could not load"}`);
      this.terminate(error);
      this.onFailure?.(error);
    };
    this.worker = worker;
    return worker;
  }
}

/** The worker side of `WorkerClient`: answers each request with `handle`'s result or its error. */
export function serveOffThread<T>(
  handle: (request: T) => Promise<{ result: unknown; transfer?: Transferable[] }>,
  failure: string,
): void {
  self.onmessage = async (event: MessageEvent<Request<T>>) => {
    const { id, request } = event.data;
    try {
      const { result, transfer = [] } = await handle(request);
      self.postMessage({ id, result } satisfies Reply, { transfer });
    } catch (e) {
      self.postMessage({ id, error: e instanceof Error ? e.message : failure } satisfies Reply);
    }
  };
}
