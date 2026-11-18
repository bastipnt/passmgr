import { ShortcutProvider } from "@repo/client";
import type { LocalProfile } from "@repo/store";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { settingsPaths } from "@/app/route-paths";
import { rememberSettingsReturn } from "@/app/settings-return";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen, within } from "@/test/render";
import SettingsHome from "./SettingsHome";
import SettingsLayout from "./SettingsLayout";

const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
vi.mock("@repo/client/src/hooks/use-sign-out", async (importActual) => ({
  ...(await importActual<object>()),
  useSignOut: () => ({ signOut: vi.fn(async () => {}), signingOut: false }),
}));
vi.mock("@/hooks/use-lock-vault", () => ({ useLockVault: () => vi.fn() }));
vi.mock("@/components/VerifyEmailDialog", () => ({ VerifyEmailPrompt: () => null }));
vi.mock("./settings-sections", async (importActual) => ({
  ...(await importActual<object>()),
  useSectionDetails: () => ({
    [settingsPaths.account]: { hint: "jana@example.com" },
    [settingsPaths.sync]: { value: "Synced", synced: true },
    [settingsPaths.vaults]: { count: 3, value: "3" },
    [settingsPaths.tags]: { count: 33, value: "33" },
  }),
}));

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@repo/ui/hooks/use-is-mobile", () => ({
  useIsMobile: () => viewport.mobile,
  isMobile: () => viewport.mobile,
}));

const LINKED: LocalProfile = {
  profileId: "p1",
  mode: "linked",
  email: "jana@example.com",
  userId: "u1",
};

function renderAt(path: string, page: ReactNode = <p>Page</p>) {
  const location = memoryLocation({ path, record: true });
  renderWithProviders(
    <Router hook={location.hook}>
      <ShortcutProvider>
        <SettingsLayout>{page}</SettingsLayout>
      </ShortcutProvider>
    </Router>,
  );
  return location;
}

beforeEach(() => {
  store.profile = LINKED;
  store.profiles = [profileEntry(LINKED)];
  rememberSettingsReturn("/", "");
});
afterEach(() => {
  viewport.mobile = false;
});

describe("settings overlay (desktop)", () => {
  it("groups the sections, with counts and the sync state, and marks the open one", () => {
    renderAt(settingsPaths.vaults);

    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    const account = screen.getByRole("list", { name: "Account" });
    expect(within(account).getByRole("link", { name: "Devices & activity" })).toHaveAttribute(
      "href",
      settingsPaths.devices,
    );
    expect(
      within(account).getByRole("link", { name: "Sync & storage Synced" }),
    ).toBeInTheDocument();
    const vault = screen.getByRole("list", { name: "Vault" });
    expect(within(vault).getByRole("link", { name: "Vaults 3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(vault).getByRole("link", { name: "Import & export" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("list", { name: "App" })).toHaveTextContent("Keyboard shortcuts");
    expect(screen.queryByRole("link", { name: /Pass Monitor/ })).toBeNull();
  });

  it("closes to the screen it was opened from, by Esc or the close button", async () => {
    rememberSettingsReturn("/record/r1", "?new=");
    rememberSettingsReturn(settingsPaths.tags, "");
    const location = renderAt(settingsPaths.tags);

    await userEvent.keyboard("{Escape}");
    expect(location.history.at(-1)).toBe("/record/r1?new=");

    await userEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(location.history.at(-1)).toBe("/record/r1?new=");
    expect(location.history).toHaveLength(3);
  });

  it("leaves Esc to an open dialog", async () => {
    const location = renderAt(
      settingsPaths.account,
      <dialog open aria-label="Change password">
        <button type="button">Inside</button>
      </dialog>,
    );

    screen.getByRole("button", { name: "Inside" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(location.history).toEqual([settingsPaths.account]);
  });

  it("offers Sign out only to a synced account", () => {
    renderAt(settingsPaths.account);
    expect(screen.getByRole("button", { name: "Lock now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("has no Sign out or devices for a vault on this device only", () => {
    const local: LocalProfile = { profileId: "p2", mode: "local", email: null, userId: null };
    store.profile = local;
    store.profiles = [profileEntry(local, "Home")];
    renderAt(settingsPaths.account);
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Devices & activity" })).toBeNull();
  });
});

describe("settings on a phone", () => {
  beforeEach(() => {
    viewport.mobile = true;
  });

  it("lists every section as a drill-down under one h1", () => {
    renderAt(settingsPaths.index, <SettingsHome />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    const vault = screen.getByRole("region", { name: "Vault" });
    const tags = within(vault).getByRole("link", { name: "Tags" });
    expect(tags).toHaveAttribute("href", settingsPaths.tags);
    expect(tags).toHaveAccessibleDescription("33");
    expect(screen.getByRole("link", { name: "Account" })).toHaveAccessibleDescription(
      "jana@example.com",
    );
    expect(screen.queryByRole("link", { name: "Keyboard shortcuts" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("gives a section page a way back to the list, and leaves the title to the page", () => {
    renderAt(settingsPaths.tags);

    expect(screen.getByRole("button", { name: "Back to Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close settings" })).toBeNull();
  });
});
