import { SessionContext, ShortcutProvider } from "@repo/client";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import Routes from "./routes";

const lockVault = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/hooks/use-lock-vault", () => ({ useLockVault: () => lockVault }));

vi.mock("@/features/settings", () => ({ default: () => <p>settings page</p> }));
vi.mock("@/features/records", () => ({ default: () => <p>records page</p> }));
vi.mock("@/features/auth", () => ({ default: () => <p>auth page</p> }));

type Session = ComponentProps<typeof SessionContext.Provider>["value"];

function renderApp(vaultUnlocked: boolean) {
  const session = { vaultUnlocked, networkOffline: false } as Session;
  renderWithProviders(
    <SessionContext.Provider value={session}>
      <ShortcutProvider>
        <Routes />
      </ShortcutProvider>
    </SessionContext.Provider>,
  );
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

beforeEach(() => {
  lockVault.mockClear();
  localStorage.clear();
  window.history.replaceState(null, "", "/settings/security");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("vault lock", () => {
  describe("idle", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldAdvanceTime: true });
    });

    it("locks on a settings route", async () => {
      localStorage.setItem("pass-mgr-auto-lock", "1");
      renderApp(true);
      expect(await screen.findByText("settings page")).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(MINUTE - SECOND);
      });
      expect(lockVault).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(SECOND);
      });
      expect(lockVault).toHaveBeenCalledTimes(1);
    });

    it.each(["abc", '"5"', "-1", "7", "null"])(
      "locks after the default when the stored timeout is %s",
      async (stored) => {
        localStorage.setItem("pass-mgr-auto-lock", stored);
        renderApp(true);
        await screen.findByText("settings page");

        act(() => {
          vi.advanceTimersByTime(15 * MINUTE - SECOND);
        });
        expect(lockVault).not.toHaveBeenCalled();
        act(() => {
          vi.advanceTimersByTime(SECOND);
        });
        expect(lockVault).toHaveBeenCalledTimes(1);
      },
    );

    it("does not run while the vault is locked", async () => {
      localStorage.setItem("pass-mgr-auto-lock", "1");
      renderApp(false);
      await screen.findByText("settings page");

      act(() => {
        vi.advanceTimersByTime(60 * MINUTE);
      });
      expect(lockVault).not.toHaveBeenCalled();
    });
  });

  it("the lock shortcut locks on a settings route", async () => {
    renderApp(true);
    await screen.findByText("settings page");

    await userEvent.keyboard("{Control>}l{/Control}");

    expect(lockVault).toHaveBeenCalledTimes(1);
  });
});
