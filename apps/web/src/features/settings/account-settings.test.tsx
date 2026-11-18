import { SessionContext } from "@repo/client";
import type { LocalProfile } from "@repo/store";
import userEvent from "@testing-library/user-event";
import type { ContextType, ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen, within } from "@/test/render";
import AccountSettingsPage from "./AccountSettingsPage";

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
const twoFactor = vi.hoisted(() => ({ enabled: false }));
vi.mock("@repo/client/src/hooks/use-two-factor", () => ({
  useTwoFactor: () => ({
    status: { enabled: twoFactor.enabled, backupCodesLeft: 7 },
    blocked: false,
    error: null,
    clearError: () => {},
    pending: false,
  }),
}));
// Its own hook test covers it; here only its trigger matters.
vi.mock("./DeleteAccountDialog", () => ({
  default: ({ children }: { children: ReactElement }) => children,
}));
const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@repo/ui/hooks/use-is-mobile", () => ({ useIsMobile: () => viewport.mobile }));

const LINKED: LocalProfile = {
  profileId: "p-linked",
  mode: "linked",
  email: "alice@example.com",
  userId: "u-alice",
};
const online = { mode: "online" } as ContextType<typeof SessionContext>;

function renderAccount() {
  return renderWithProviders(
    <SessionContext.Provider value={online}>
      <AccountSettingsPage />
    </SessionContext.Provider>,
  );
}

beforeEach(() => {
  store.profiles = [profileEntry(LINKED)];
  store.profile = LINKED;
});
afterEach(() => {
  viewport.mobile = false;
  twoFactor.enabled = false;
});

describe("AccountSettingsPage", () => {
  it("shows the account, its sign-in and the danger group on desktop", () => {
    renderAccount();

    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    const signIn = screen.getByRole("region", { name: "Sign-in" });
    expect(within(signIn).getByRole("button", { name: "Change password" })).toBeInTheDocument();
    expect(within(signIn).getByText("· Off")).toBeInTheDocument();
    expect(within(signIn).getByRole("button", { name: "Turn on" })).toBeInTheDocument();

    const danger = screen.getByRole("region", { name: "Leave or delete" });
    expect(within(danger).getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(within(danger).getByRole("button", { name: "Delete account" })).toBeInTheDocument();
  });

  it("offers turning two-factor off and new backup codes once it's on", () => {
    twoFactor.enabled = true;
    renderAccount();

    expect(screen.getByText("· On")).toBeInTheDocument();
    expect(screen.getByText(/7 backup codes left/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn off" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New backup codes" })).toBeInTheDocument();
  });

  it("opens the dialogs from whole rows on a phone", async () => {
    viewport.mobile = true;
    renderAccount();

    await userEvent.click(screen.getByRole("button", { name: "Password" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(/password/i);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "Remove from this device" }));
    expect(
      await screen.findByRole("dialog", { name: "Remove vault from this device?" }),
    ).toBeInTheDocument();
  });
});
