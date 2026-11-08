import { setClientErrorSender } from "@repo/client";
import { toast } from "@repo/ui";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGlobalErrorToast } from "./use-global-error-toast";

vi.mock("@repo/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const SECRET = "hunter2-decrypted-password";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  setClientErrorSender(null);
});

function rejection(reason: unknown) {
  return Object.assign(new Event("unhandledrejection"), { reason });
}

describe("useGlobalErrorToast", () => {
  it("toasts an unhandled rejection with a safe message and an error ID", () => {
    renderHook(() => useGlobalErrorToast());
    window.dispatchEvent(rejection(new Error(SECRET)));

    expect(toast.error).toHaveBeenCalledOnce();
    const [message, options] = vi.mocked(toast.error).mock.calls[0] ?? [];
    expect(message).toBe("Something went wrong. Try again.");
    expect(options).toMatchObject({ description: expect.stringMatching(/^Error ID [0-9a-f]{8}$/) });
    expect(JSON.stringify([message, options?.description])).not.toContain(SECRET);
  });

  it("toasts an uncaught error but not a ResizeObserver loop", () => {
    renderHook(() => useGlobalErrorToast());
    window.dispatchEvent(
      new ErrorEvent("error", { message: "ResizeObserver loop completed", error: null }),
    );
    expect(toast.error).not.toHaveBeenCalled();

    window.dispatchEvent(new ErrorEvent("error", { message: SECRET, error: new Error(SECRET) }));
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it("stops listening on unmount", () => {
    renderHook(() => useGlobalErrorToast()).unmount();
    window.dispatchEvent(rejection(new Error("x")));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("counts the crash on the server by kind, without the error", () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    setClientErrorSender(sender);
    renderHook(() => useGlobalErrorToast());

    window.dispatchEvent(rejection(new Error(SECRET)));
    window.dispatchEvent(new ErrorEvent("error", { message: SECRET, error: new Error(SECRET) }));

    expect(sender.mock.calls.map(([report]) => report)).toEqual([
      { kind: "rejection", area: "app", platform: "web", version: "other" },
      { kind: "uncaught", area: "app", platform: "web", version: "other" },
    ]);
  });
});
