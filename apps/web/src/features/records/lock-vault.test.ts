import { secretsStore } from "@repo/store";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLockVault } from "./lock-vault";

const logout = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => ({ login: { logout: { mutate: logout } } }),
}));

const reload = vi.fn();

beforeEach(() => {
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

  it("ignores a second lock while the first is in flight", async () => {
    signedIn(true);
    logout.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useLockVault());

    await act(() => Promise.all([result.current(), result.current()]));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
