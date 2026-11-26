import { afterEach, describe, expect, it, vi } from "vitest";
import { runOffThread, serveOffThread, WorkerClient } from "../src/util/worker-client";

type Handler = Parameters<typeof serveOffThread<unknown>>[0];

/** A worker whose other side is `serveOffThread(handler)`, run on this thread. */
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string; preventDefault: () => void }) => void) | null = null;
  readonly posted: { data: unknown; transfer: Transferable[] }[] = [];
  terminated = false;
  private readonly served: { onmessage: ((event: { data: unknown }) => void) | null } = {
    onmessage: null,
  };

  constructor(handler: Handler) {
    const served = this.served;
    vi.stubGlobal("self", {
      set onmessage(fn: (event: { data: unknown }) => void) {
        served.onmessage = fn;
      },
      postMessage: (data: unknown) => this.onmessage?.({ data }),
    });
    serveOffThread(handler, "Fake failed");
  }

  postMessage(data: unknown, transfer: Transferable[]) {
    this.posted.push({ data, transfer });
    this.served.onmessage?.({ data });
  }

  terminate() {
    this.terminated = true;
  }

  fail(message: string) {
    this.onerror?.({ message, preventDefault: () => {} });
  }
}

function client(handler: Handler, options?: { serial?: boolean }) {
  const workers: FakeWorker[] = [];
  const start = () => {
    const worker = new FakeWorker(handler);
    workers.push(worker);
    return worker as unknown as Worker;
  };
  return { client: new WorkerClient(start, "Fake worker", options), workers };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runOffThread", () => {
  it("runs in-thread where there is no Worker (Node)", async () => {
    const offThread = vi.fn(async () => "worker");
    expect(await runOffThread(offThread, () => "thread")).toBe("thread");
    expect(offThread).not.toHaveBeenCalled();
  });

  it("turns an in-thread throw into a rejection", async () => {
    const failing = runOffThread(
      async () => "worker",
      () => {
        throw new Error("boom");
      },
    );
    await expect(failing).rejects.toThrow("boom");
  });

  it("runs off-thread where there is a Worker", async () => {
    vi.stubGlobal("Worker", class {});
    const inThread = vi.fn(() => "thread");
    expect(await runOffThread(async () => "worker", inThread)).toBe("worker");
    expect(inThread).not.toHaveBeenCalled();
  });
});

describe("WorkerClient", () => {
  it("starts one worker lazily and answers with the handler's result", async () => {
    const { client: c, workers } = client(async (n) => ({ result: (n as number) * 2 }));
    expect(workers).toHaveLength(0);
    expect(await c.request(2)).toBe(4);
    expect(await c.request(5)).toBe(10);
    expect(workers).toHaveLength(1);
  });

  it("passes the transfer list to the worker", async () => {
    const { client: c, workers } = client(async () => ({ result: null }));
    const buffer = new ArrayBuffer(4);
    await c.request("x", [buffer]);
    expect(workers[0]?.posted[0]?.transfer).toEqual([buffer]);
  });

  it("rejects with the handler's error message, or the fallback for a non-Error", async () => {
    const { client: c } = client(async (request) => {
      if (request === "error") throw new Error("bad input");
      throw "not an error";
    });
    await expect(c.request("error")).rejects.toThrow("bad input");
    await expect(c.request("other")).rejects.toThrow("Fake failed");
  });

  it("matches overlapping replies to their own call", async () => {
    const gates = new Map([
      ["a", deferred<void>()],
      ["b", deferred<void>()],
    ]);
    const { client: c } = client(async (request) => {
      await gates.get(request as string)?.promise;
      return { result: request };
    });
    const a = c.request("a");
    const b = c.request("b");
    gates.get("b")?.resolve();
    expect(await b).toBe("b");
    gates.get("a")?.resolve();
    expect(await a).toBe("a");
  });

  it("serial: posts a call only once the one before it settled", async () => {
    const gate = deferred<void>();
    const { client: c, workers } = client(
      async (request) => {
        if (request === "first") {
          await gate.promise;
          throw new Error("first failed");
        }
        return { result: request };
      },
      { serial: true },
    );
    const first = c.request("first");
    const second = c.request("second");
    await Promise.resolve();
    expect(workers[0]?.posted).toHaveLength(1);
    gate.resolve();
    await expect(first).rejects.toThrow("first failed");
    expect(await second).toBe("second");
    expect(workers[0]?.posted).toHaveLength(2);
  });

  it("fails every waiting call on a worker error and retries with a new worker", async () => {
    const gate = deferred<void>();
    const { client: c, workers } = client(async (request) => {
      await gate.promise;
      return { result: request };
    });
    const a = c.request("a");
    const b = c.request("b");
    workers[0]?.fail("");
    await expect(a).rejects.toThrow("Fake worker failed: could not load");
    await expect(b).rejects.toThrow("Fake worker failed: could not load");
    expect(workers[0]?.terminated).toBe(true);

    gate.resolve();
    const again = c.request("again");
    expect(await again).toBe("again");
    expect(workers).toHaveLength(2);
  });

  it("names the worker's error message when there is one", async () => {
    const { client: c, workers } = client(() => new Promise(() => {}));
    const pending = c.request("x");
    workers[0]?.fail("404");
    await expect(pending).rejects.toThrow("Fake worker failed: 404");
  });

  it("terminate rejects what's waiting and drops the worker", async () => {
    const { client: c, workers } = client(() => new Promise(() => {}));
    const pending = c.request("x");
    c.terminate();
    await expect(pending).rejects.toThrow("Fake worker terminated");
    expect(workers[0]?.terminated).toBe(true);
    c.terminate();
    expect(workers).toHaveLength(1);
  });

  it("cancel rejects what's waiting and keeps the worker", async () => {
    const { client: c, workers } = client(async (request) => ({ result: request }));
    expect(c.started).toBe(false);
    const gate = deferred<void>();
    const { client: slow, workers: slowWorkers } = client(async () => {
      await gate.promise;
      return { result: 1 };
    });
    const pending = slow.request("x");
    slow.cancel(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
    expect(slowWorkers[0]?.terminated).toBe(false);
    expect(slow.started).toBe(true);
    gate.resolve();
    expect(await c.request("y")).toBe("y");
    expect(workers).toHaveLength(1);
  });

  it("ignores a reply for a call that is no longer waiting", async () => {
    const { client: c, workers } = client(async () => ({ result: 1 }));
    await c.request("x");
    workers[0]?.onmessage?.({ data: { id: 0, result: 2 } });
    expect(await c.request("y")).toBe(1);
  });
});
