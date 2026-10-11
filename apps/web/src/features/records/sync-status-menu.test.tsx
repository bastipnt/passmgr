import { SessionContext, type SessionMode, type SyncStatus } from "@repo/client";
import { secretsStore } from "@repo/store";
import userEvent from "@testing-library/user-event";
import type { ContextType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { settingsPaths } from "@/app/route-paths";
import { createFakeStore } from "@/test/fake-store";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { SyncStatusMenu } from "./SyncStatusMenu";

const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));

const connect = vi.fn(async () => "online" as const);
vi.mock("@repo/client/src/hooks/use-connect-server", async (importActual) => ({
  ...(await importActual<object>()),
  useConnectServer: () => ({ connect }),
}));

let status: SyncStatus;
const sync = vi.fn(async () => true);
const retryParked = vi.fn(async () => undefined);

beforeEach(() => {
  status = { phase: "idle", pending: 0, parked: 0, error: null, lastSyncedAt: null, enabled: true };
  // The fake only grows what the menu calls.
  Object.assign(store.syncManager, { getStatus: () => status, sync, retryParked });
  vi.clearAllMocks();
  secretsStore.clearPassword();
});

function renderMenu(mode: SessionMode, networkOffline = false) {
  const location = memoryLocation({ path: "/", record: true });
  const session = { mode, networkOffline } as ContextType<typeof SessionContext>;
  renderWithProviders(
    <Router hook={location.hook}>
      <SessionContext.Provider value={session}>
        <SyncStatusMenu />
      </SessionContext.Provider>
    </Router>,
  );
  return location;
}

describe("SyncStatusMenu", () => {
  it("a local vault offers to create an online account", async () => {
    const location = renderMenu("local");
    await userEvent.click(screen.getByRole("button", { name: "Sync status: On this device only" }));
    const create = await screen.findByRole("menuitem", { name: "Create online account" });
    expect(screen.queryByRole("menuitem", { name: "Sync now" })).toBeNull();

    await userEvent.click(create);
    await waitFor(() => expect(location.history.at(-1)).toBe(settingsPaths.account));
  });

  it("offline is a state, not an error: no sync, the changes wait on the device", async () => {
    status = { ...status, phase: "offline", pending: 2 };
    renderMenu("online", true);
    await userEvent.click(screen.getByRole("button", { name: "Sync status: Offline" }));
    expect(await screen.findByText(/2 changes saved on this device/)).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Sync now" })).toBeNull();
  });

  it("syncs on demand while online", async () => {
    status = { ...status, pending: 1, lastSyncedAt: Date.now() };
    renderMenu("online");
    await userEvent.click(screen.getByRole("button", { name: "Sync status: 1 change waiting" }));
    expect(await screen.findByText("Last synced just now")).toBeTruthy();

    await userEvent.click(await screen.findByRole("menuitem", { name: "Sync now" }));
    expect(sync).toHaveBeenCalledOnce();
  });

  it("a failed round can be synced again by hand", async () => {
    status = { ...status, phase: "error", error: "boom" };
    renderMenu("online");
    await userEvent.click(screen.getByRole("button", { name: "Sync status: Sync failed" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sync now" }));
    expect(sync).toHaveBeenCalledOnce();
  });

  it("parked changes can be retried", async () => {
    status = { ...status, pending: 1, parked: 1 };
    renderMenu("online");
    await userEvent.click(
      screen.getByRole("button", { name: "Sync status: Some changes didn't sync" }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Retry failed changes" }));
    expect(retryParked).toHaveBeenCalledOnce();
  });

  it("not connected with the unlock's password at hand: connect by hand", async () => {
    // E.g. the two-factor prompt of the automatic reconnect was closed.
    secretsStore.setPassword("hunter2hunter2");
    status = { ...status, phase: "offline" };
    renderMenu("offline");
    await userEvent.click(screen.getByRole("button", { name: "Sync status: Not connected" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Connect now" }));
    expect(connect).toHaveBeenCalledWith("hunter2hunter2");
  });

  it("no connect by hand without the password, or without network", async () => {
    status = { ...status, phase: "offline" };
    renderMenu("offline");
    await userEvent.click(screen.getByRole("button", { name: "Sync status: Not connected" }));
    await screen.findByRole("menuitem", { name: "Account & sync" });
    expect(screen.queryByRole("menuitem", { name: "Connect now" })).toBeNull();
  });
});
