import { ShortcutProvider } from "@repo/client";
import type { LocalProfile } from "@repo/store";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { rememberOverlayReturn } from "@/app/overlay-return";
import { settingsPaths } from "@/app/route-paths";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { act, renderWithProviders, screen, waitFor, within } from "@/test/render";
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
  rememberOverlayReturn("/");
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
    rememberOverlayReturn("/record/r1/edit");
    rememberOverlayReturn(settingsPaths.tags);
    const location = renderAt(settingsPaths.tags);

    await userEvent.keyboard("{Escape}");
    expect(location.history.at(-1)).toBe("/record/r1");

    await userEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(location.history.at(-1)).toBe("/record/r1");
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

  it("searches from the header: / focuses, Enter opens the first match", async () => {
    const location = renderAt(settingsPaths.account);
    const field = screen.getByRole("combobox", { name: "Search settings" });

    await userEvent.keyboard("/");
    expect(field).toHaveFocus();
    await userEvent.keyboard("lock");
    expect(screen.queryByText("Page")).toBeNull();
    const results = screen.getByRole("listbox", { name: "Matching settings" });
    const option = within(results).getByRole("option", { name: "Security › Lock when idle" });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(field).toHaveAttribute("aria-activedescendant", option.id);

    await userEvent.keyboard("{Enter}");
    expect(location.history.at(-1)).toBe(settingsPaths.security);
    expect(field).toHaveValue("");
    expect(screen.getByText("Page")).toBeInTheDocument();
  });

  it("doesn't add a history entry for a match on the page in view", async () => {
    const location = renderAt(settingsPaths.security);
    await userEvent.type(screen.getByRole("combobox", { name: "Search settings" }), "lock{Enter}");
    expect(location.history).toEqual([settingsPaths.security]);
  });

  it("moves through the matches with the arrow keys", async () => {
    const location = renderAt(settingsPaths.account);
    await userEvent.type(screen.getByRole("combobox", { name: "Search settings" }), "timeout");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}{Enter}");
    expect(location.history.at(-1)).toBe(settingsPaths.security);
  });

  it("says when nothing matches", async () => {
    renderAt(settingsPaths.account);
    await userEvent.type(screen.getByRole("combobox", { name: "Search settings" }), "zzz");
    expect(screen.getByRole("status")).toHaveTextContent("No settings match “zzz”");
  });

  it("clears the search on Esc, then closes", async () => {
    const location = renderAt(settingsPaths.account);
    const field = screen.getByRole("combobox", { name: "Search settings" });
    await userEvent.type(field, "theme");

    await userEvent.keyboard("{Escape}");
    expect(field).toHaveValue("");
    expect(location.history).toEqual([settingsPaths.account]);
    await userEvent.keyboard("{Escape}");
    expect(location.history.at(-1)).toBe("/");
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

  it("replaces the list with the matches while typing; Back clears", async () => {
    renderAt(settingsPaths.index, <SettingsHome />);
    await userEvent.type(screen.getByRole("combobox", { name: "Search settings" }), "2fa");

    expect(screen.queryByRole("region", { name: "Vault" })).toBeNull();
    expect(
      screen.getByRole("option", { name: "Account › Two-factor authentication" }),
    ).toBeInTheDocument();

    act(() => history.back());
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Search settings" })).toHaveValue(""),
    );
    expect(screen.getByRole("region", { name: "Vault" })).toBeInTheDocument();
  });

  it("drops the search's history entry once the field is emptied", async () => {
    renderAt(settingsPaths.index, <SettingsHome />);
    const field = screen.getByRole("combobox", { name: "Search settings" });
    await userEvent.type(field, "ab");
    expect(history.state).toEqual({ settingsSearch: "ab" });

    await userEvent.clear(field);
    await waitFor(() => expect(history.state).toBeNull());
  });

  it("opens a match by a tap", async () => {
    const location = renderAt(settingsPaths.index, <SettingsHome />);
    await userEvent.type(screen.getByRole("combobox", { name: "Search settings" }), "accent");
    await userEvent.click(screen.getByRole("option", { name: "Appearance › Accent" }));
    expect(location.history.at(-1)).toBe(settingsPaths.appearance);
  });
});
