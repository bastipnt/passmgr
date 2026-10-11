import { useEmergencyKit } from "@repo/client";
import { ServerUrlContext } from "@repo/client/src/providers/ClientProvider";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createEmergencyKit } = vi.hoisted(() => ({ createEmergencyKit: vi.fn() }));

vi.mock("@repo/client/src/account/emergency-kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/account/emergency-kit")>()),
  createEmergencyKit,
}));

const kit = () => ({ fileName: "kit.pdf", bytes: new Uint8Array([1, 2, 3]) });

function renderKit(serverUrl: string, recoveryKey = new Uint8Array(32).fill(7)) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServerUrlContext value={serverUrl}>{children}</ServerUrlContext>
  );
  return renderHook(() => useEmergencyKit(recoveryKey, { email: " Ada@Example.com " }), {
    wrapper,
  });
}

describe("useEmergencyKit", () => {
  beforeEach(() => {
    createEmergencyKit.mockReset();
  });

  it("prints a server configured as a path as a full URL, and the normalized email", async () => {
    createEmergencyKit.mockResolvedValue(kit());
    const { result } = renderKit("/trpc");

    await act(() => result.current.saveKit(() => true));

    expect(createEmergencyKit).toHaveBeenCalledWith(
      expect.objectContaining({
        account: { email: "ada@example.com", serverUrl: `${window.location.origin}/trpc` },
      }),
    );
  });

  it("counts a handed-over kit as saved and wipes its bytes", async () => {
    const file = kit();
    createEmergencyKit.mockResolvedValue(file);
    const { result } = renderKit("https://vault.example.com");

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.saveKit(() => true);
    });

    expect(outcome).toBe("saved");
    expect(result.current.kitSaved).toBe(true);
    expect(result.current.saved).toBe(true);
    expect(file.bytes.every((b) => b === 0)).toBe(true);
  });

  it("keeps 'I saved it' off while the kit is built, even after copying", async () => {
    let finish: (value: ReturnType<typeof kit>) => void = () => {};
    createEmergencyKit.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderKit("https://vault.example.com");

    act(() => result.current.markCopied());
    expect(result.current.saved).toBe(true);

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.saveKit(() => true);
    });
    expect(result.current.kitBusy).toBe(true);
    expect(result.current.saved).toBe(false);

    await act(async () => {
      finish(kit());
      await pending;
    });
    expect(result.current.saved).toBe(true);
  });

  it("doesn't count a cancelled hand-over, and reports a kit that couldn't be built", async () => {
    createEmergencyKit.mockResolvedValueOnce(kit()).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderKit("https://vault.example.com");

    let cancelled: string | undefined;
    let failed: string | undefined;
    await act(async () => {
      cancelled = await result.current.saveKit(() => {
        throw new Error("closed");
      });
      failed = await result.current.saveKit(() => true);
    });

    expect(cancelled).toBe("cancelled");
    expect(failed).toBe("failed");
    expect(result.current.saved).toBe(false);
  });
});
