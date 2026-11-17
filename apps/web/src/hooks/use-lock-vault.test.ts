import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logout = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => ({ login: { logout: { mutate: logout } } }),
}));

const reload = vi.fn();

// The in-flight guard is module state: a fresh module per test.
let useLockVault: typeof import("./use-lock-vault").useLockVault;
let secretsStore: typeof import("@repo/store").secretsStore;
let copyToClipboard: typeof import("@repo/client").copyToClipboard;

beforeEach(async () => {
  vi.resetModules();
  ({ useLockVault } = await import("./use-lock-vault"));
  ({ secretsStore } = await import("@repo/store"));
  ({ copyToClipboard } = await import("@repo/client"));
  vi.spyOn(window, "location", "get").mockReturnValue({ reload } as unknown as Location);
});

afterEach(() => {
  vi.restoreAllMocks();
  logout.mockReset();
  reload.mockReset();
  document.body.style.visibility = "";
  document.body.inert = false;
});

function signedIn(value: boolean) {
  vi.spyOn(secretsStore, "hasServerSession", "get").mockReturnValue(value);
}

describe("useLockVault", () => {
  it("hides the page, ends the server session, then reloads", async () => {
    signedIn(true);
    logout.mockImplementation(async () => {
      expect(document.body.style.visibility).toBe("hidden");
      expect(document.body.inert).toBe(true);
      expect(reload).not.toHaveBeenCalled();
      return { ok: true };
    });
    const { result } = renderHook(() => useLockVault());

    await act(() => result.current());

    expect(logout).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads without a request when there is no server session (local / offline)", async () => {
    signedIn(false);
    const { result } = renderHook(() => useLockVault());

    await act(() => result.current());

    expect(logout).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still reloads when the logout fails", async () => {
    signedIn(true);
    logout.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useLockVault());

    await act(() => result.current());

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("clears a copied secret before the reload cancels its auto-clear", async () => {
    signedIn(false);
    let clipboard = "";
    const write = vi.fn(async (text: string) => {
      clipboard = text;
    });
    await copyToClipboard({ write }, "hunter2", 30);
    reload.mockImplementation(() => expect(clipboard).toBe(""));
    const { result } = renderHook(() => useLockVault());

    await act(() => result.current());

    expect(reload).toHaveBeenCalledTimes(1);
    expect(clipboard).toBe("");
  });

  it("ignores a second lock while the first is in flight", async () => {
    signedIn(true);
    logout.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useLockVault());

    await act(() => Promise.all([result.current(), result.current()]));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores a lock from another caller while the first is in flight", async () => {
    signedIn(true);
    logout.mockResolvedValue({ ok: true });
    const idle = renderHook(() => useLockVault());
    const button = renderHook(() => useLockVault());

    await act(() => Promise.all([idle.result.current(), button.result.current()]));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
