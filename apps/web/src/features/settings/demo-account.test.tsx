import { SessionContext } from "@repo/client";
import type { LocalProfile } from "@repo/store";
import type { ContextType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen } from "@/test/render";
import AccountSettings from "./AccountSettings";
import ExportSettings from "./ExportSettings";

const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => ({}),
}));
vi.mock("@repo/client/src/hooks/use-email-verification", () => ({
  useEmailVerification: () => ({ required: false }),
}));

const DEMO: LocalProfile = { profileId: "p-demo", mode: "local", email: null, userId: null };
const local = { mode: "local" } as ContextType<typeof SessionContext>;

beforeEach(() => {
  store.profiles = [{ ...profileEntry(DEMO, "Demo vault"), demo: true }];
  store.profile = DEMO;
});
afterEach(() => vi.unstubAllEnvs());

describe("Account & sync of a demo vault", () => {
  it("says it can't sync and offers no account or password change", () => {
    renderWithProviders(
      <SessionContext.Provider value={local}>
        <AccountSettings />
      </SessionContext.Provider>,
    );

    expect(screen.getByRole("note").textContent).toMatch(/can't be synced or linked/);
    expect(screen.queryByRole("button", { name: /Create online account/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Change password/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Remove from device/ })).toBeTruthy();
  });

  it("keeps export in demo mode, import not", () => {
    vi.stubEnv("VITE_DEMO_MODE", "true");
    renderWithProviders(<ExportSettings />);
    expect(screen.getByRole("button", { name: /Export/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Import/ })).toBeNull();
  });
});
