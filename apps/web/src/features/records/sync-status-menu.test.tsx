import { SessionContext, type SessionMode, type SyncStatus } from "@repo/client";
import { secretsStore } from "@repo/store";
import userEvent from "@testing-library/user-event";
import type { ContextType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { passMonitorPaths, settingsPaths } from "@/app/route-paths";
import { createFakeStore } from "@/test/fake-store";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { AccountMenu } from "./AccountMenu";
import { SyncStatusCard } from "./SyncStatusMenu";

const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));

const issueCount = vi.hoisted(() => ({ value: null as number | null }));
vi.mock("@repo/client/src/hooks/use-pass-monitor", async (importActual) => ({
  ...(await importActual<object>()),
  usePassMonitorIssueCount: () => issueCount.value,
}));
const lockVault = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./lock-vault", () => ({ useLockVault: () => lockVault }));

const connect = vi.fn(async () => "online" as const);
const connectWithDevice = vi.fn(async () => "online" as const);
vi.mock("@repo/client/src/hooks/use-connect-server", async (importActual) => ({
  ...(await importActual<object>()),
  useConnectServer: () => ({ connect, connectWithDevice }),
}));
const deviceLogin = {
  challenge: new Uint8Array(32),
  startedAt: 0,
  finish: vi.fn(),
  discard: vi.fn(),
};
const take = vi.fn(async () => deviceLogin);
vi.mock("@repo/client/src/hooks/use-device-login", async (importActual) => ({
  ...(await importActual<object>()),
  useDeviceLogin: () => ({ take, prepare: vi.fn(), drop: vi.fn(), settle: vi.fn((_l, r) => r) }),
}));
vi.mock("@repo/crypto", async (importActual) => ({
  ...(await importActual<object>()),
  authenticateBiometric: vi.fn(async () => ({
    accountKey: new Uint8Array(32).fill(1),
    assertion: { authenticatorData: "a", clientDataJSON: "c", signature: "s" },
  })),
}));

let status: SyncStatus;
const sync = vi.fn(async () => true);
const retryParked = vi.fn(async () => undefined);

beforeEach(() => {
  status = {
    phase: "idle",
    pending: 0,
    parked: 0,
    storageFull: false,
    error: null,
    lastSyncedAt: null,
    enabled: true,
  };
  // The fake only grows what the menu calls.
  Object.assign(store.syncManager, { getStatus: () => status, sync, retryParked });
  vi.clearAllMocks();
  secretsStore.clearOpaquePassword();
  store.biometricKeyMaterial = null;
  issueCount.value = null;
});

function renderMenu(mode: SessionMode, networkOffline = false, indicator = <AccountMenu />) {
  const location = memoryLocation({ path: "/", record: true });
  const session = { mode, networkOffline } as ContextType<typeof SessionContext>;
  renderWithProviders(
    <Router hook={location.hook}>
      <SessionContext.Provider value={session}>{indicator}</SessionContext.Provider>
    </Router>,
  );
  return location;
}

describe("AccountMenu: sync", () => {
  it("a local vault offers to create an online account", async () => {
    const location = renderMenu("local");
    await userEvent.click(
      screen.getByRole("button", { name: /sync status: On this device only$/ }),
    );
    const create = await screen.findByRole("menuitem", { name: "Create online account" });
    expect(screen.queryByRole("menuitem", { name: "Sync now" })).toBeNull();

    await userEvent.click(create);
    await waitFor(() => expect(location.history.at(-1)).toBe(settingsPaths.account));
  });

  it("offline is a state, not an error: no sync, the changes wait on the device", async () => {
    status = { ...status, phase: "offline", pending: 2 };
    renderMenu("online", true);
    await userEvent.click(screen.getByRole("button", { name: /sync status: Offline$/ }));
    expect(await screen.findByText(/2 changes saved on this device/)).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Sync now" })).toBeNull();
  });

  it("syncs on demand while online", async () => {
    status = { ...status, pending: 1, lastSyncedAt: Date.now() };
    renderMenu("online");
    await userEvent.click(screen.getByRole("button", { name: /sync status: 1 change waiting$/ }));
    expect(await screen.findByText("Last synced just now")).toBeTruthy();

    await userEvent.click(await screen.findByRole("menuitem", { name: "Sync now" }));
    expect(sync).toHaveBeenCalledOnce();
  });

  it("a failed round can be synced again by hand", async () => {
    status = { ...status, phase: "error", error: "boom" };
    renderMenu("online");
    await userEvent.click(screen.getByRole("button", { name: /sync status: Sync failed$/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sync now" }));
    expect(sync).toHaveBeenCalledOnce();
  });

  it("parked changes can be retried", async () => {
    status = { ...status, pending: 1, parked: 1 };
    renderMenu("online");
    await userEvent.click(
      screen.getByRole("button", { name: /sync status: Some changes didn't sync$/ }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Retry failed changes" }));
    expect(retryParked).toHaveBeenCalledOnce();
  });

  it("not connected with the unlock's OPAQUE password at hand: connect by hand", async () => {
    // E.g. the two-factor prompt of the automatic reconnect was closed.
    secretsStore.keepOpaquePassword(new Uint8Array(32).fill(1));
    status = { ...status, phase: "offline" };
    renderMenu("offline");
    await userEvent.click(screen.getByRole("button", { name: /sync status: Not connected$/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Connect now" }));
    expect(connect).toHaveBeenCalledWith(new Uint8Array(32).fill(1));
  });

  it("without a password at hand, connects by hand through the biometric prompt", async () => {
    store.biometricKeyMaterial = {
      biometricEncryptedAccountKey: "bak",
      biometricNonce: "bn",
      credentialId: "cred",
      prfSalt: "prf",
      biometricDeviceLogin: "1",
    };
    status = { ...status, phase: "offline" };
    renderMenu("offline");
    await userEvent.click(screen.getByRole("button", { name: /sync status: Not connected$/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Connect now" }));
    await waitFor(() => expect(connectWithDevice).toHaveBeenCalledTimes(1));
    expect(take).toHaveBeenCalledWith("cred");
    expect(connect).not.toHaveBeenCalled();
  });

  it("no connect by hand without the password, or without network", async () => {
    status = { ...status, phase: "offline" };
    renderMenu("offline");
    await userEvent.click(screen.getByRole("button", { name: /sync status: Not connected$/ }));
    await screen.findByRole("menuitem", { name: "Account & sync" });
    expect(screen.queryByRole("menuitem", { name: "Connect now" })).toBeNull();
  });
});

describe("SyncStatusCard", () => {
  const renderCard = (mode: SessionMode, networkOffline = false) =>
    renderMenu(mode, networkOffline, <SyncStatusCard />);
  const card = () => screen.getByRole("button", { name: /^Sync status:/ });

  it("online: when it last synced, and sync now", async () => {
    status = { ...status, lastSyncedAt: Date.now() - 2 * 60_000 };
    renderCard("online");
    expect(card()).toHaveAccessibleName("Sync status: Synced");
    expect(card()).toHaveTextContent("OnlineSynced 2 minutes ago");

    await userEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(sync).toHaveBeenCalledOnce();
  });

  it("offline: the last sync's time, no sync now", () => {
    status = { ...status, phase: "offline", lastSyncedAt: Date.now() };
    renderCard("online", true);
    expect(card()).toHaveTextContent(/^OfflineLast synced \S+/);
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
  });

  it("offline with changes waiting says how many", () => {
    status = { ...status, phase: "offline", pending: 4, lastSyncedAt: Date.now() };
    renderCard("online", true);
    expect(card()).toHaveTextContent("Offline4 changes waiting");
  });

  it("a local vault: on this device, no sync", () => {
    renderCard("local");
    expect(card()).toHaveTextContent("On this deviceNo sync");
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
  });

  it("an error keeps the summary's wording, and opens the details", async () => {
    status = { ...status, pending: 1, parked: 1 };
    renderCard("online");
    expect(card()).toHaveTextContent(/^Some changes didn't sync/);

    await userEvent.click(card());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Retry failed changes" }));
    expect(retryParked).toHaveBeenCalledOnce();
  });

  it("collapsed: only the dot, the lines in its tooltip, opening the same details", async () => {
    status = { ...status, lastSyncedAt: Date.now() - 2 * 60_000 };
    renderMenu("online", false, <SyncStatusCard collapsed />);
    expect(card()).toHaveAccessibleName("Sync status: Synced");
    expect(card()).toHaveTextContent("");
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();

    await userEvent.hover(card());
    expect(await screen.findByText("Synced 2 minutes ago")).toBeInTheDocument();

    await userEvent.click(card());
    expect(await screen.findByRole("menuitem", { name: "Sync now" })).toBeInTheDocument();
  });
});

describe("AccountMenu", () => {
  const button = () => screen.getByRole("button", { name: /^Account/ });

  it("names the Pass Monitor issues and the sync state, with an amber badge", () => {
    issueCount.value = 3;
    renderMenu("online");
    expect(button()).toHaveAccessibleName("Account, 3 Pass Monitor issues, sync status: Synced");
    expect(button()).toHaveTextContent("3");
  });

  it("shows no badge while nothing is known or nothing is wrong", () => {
    for (const count of [null, 0]) {
      issueCount.value = count;
      const { unmount } = renderWithProviders(
        <Router hook={memoryLocation({ path: "/" }).hook}>
          <SessionContext.Provider value={{ mode: "local" } as ContextType<typeof SessionContext>}>
            <AccountMenu />
          </SessionContext.Provider>
        </Router>,
      );
      expect(button()).toHaveAccessibleName("Account, sync status: On this device only");
      expect(button()).toHaveTextContent("");
      unmount();
    }
  });

  it("links the Pass Monitor and Settings, and locks", async () => {
    const location = renderMenu("local");
    await userEvent.click(button());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Pass Monitor" }));
    await waitFor(() => expect(location.history.at(-1)).toBe(passMonitorPaths.index));

    await userEvent.click(button());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Lock vault" }));
    expect(lockVault).toHaveBeenCalledOnce();

    await userEvent.click(button());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Settings" }));
    await waitFor(() => expect(location.history.at(-1)).toBe(settingsPaths.index));
  });
});
