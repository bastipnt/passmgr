import { afterEach, describe, expect, it, vi } from "vitest";
import { END_SERVER_SESSION_TIMEOUT_MS, endServerSession } from "../src/util/end-server-session";

type Mutate = (input: object, opts: { signal: AbortSignal }) => Promise<unknown>;

function client(mutate: Mutate) {
  return { login: { logout: { mutate } } } as unknown as Parameters<typeof endServerSession>[0];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("endServerSession", () => {
  it("calls login.logout", async () => {
    const mutate = vi.fn<Mutate>(async () => ({ ok: true }));

    await endServerSession(client(mutate));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]?.[1].signal.aborted).toBe(false);
  });

  it("swallows a failed logout", async () => {
    const mutate = vi.fn<Mutate>(async () => {
      throw new Error("network");
    });

    await expect(endServerSession(client(mutate))).resolves.toBeUndefined();
  });

  it("gives up and aborts the request after the timeout", async () => {
    vi.useFakeTimers();
    const mutate = vi.fn<Mutate>(() => new Promise(() => {}));
    let settled = false;

    const ending = endServerSession(client(mutate)).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(END_SERVER_SESSION_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await ending;

    expect(settled).toBe(true);
    expect(mutate.mock.calls[0]?.[1].signal.aborted).toBe(true);
  });

  it("clears the timer when the logout finishes first", async () => {
    vi.useFakeTimers();
    const mutate = vi.fn<Mutate>(async () => ({ ok: true }));

    await endServerSession(client(mutate));

    expect(vi.getTimerCount()).toBe(0);
    expect(mutate.mock.calls[0]?.[1].signal.aborted).toBe(false);
  });
});
