import { buildExportData, encryptExport, exportToJson } from "@repo/client";
import { getPasswordKekParams, setPasswordKekParams } from "@repo/crypto";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { authPaths } from "@/app/route-paths";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import RestoreBackupPage from "./RestoreBackupPage";

const restoreHook = vi.hoisted(() => ({
  restore: vi.fn(),
  finishRestore: vi.fn(),
  restoreError: undefined as "failed" | "unlock_failed" | undefined,
}));
vi.mock("@repo/client/src/hooks/use-restore-backup", () => ({
  useRestoreBackup: () => restoreHook,
}));
const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
// The real Argon2 derivation, on the main thread (no workers here).
vi.mock("@repo/crypto/services/argon2-worker-service", async () => {
  const { retrievePRK: derive } = await import("@repo/crypto");
  return { argon2WorkerService: { derive } };
});
let mockPersistent: boolean | null = true;
vi.mock("@/hooks/use-storage-persistent", () => ({ useStoragePersistent: () => mockPersistent }));
vi.mock("@/hooks/use-storage-durability", () => ({ requestPersistentStorage: vi.fn() }));

Object.defineProperty(globalThis.navigator, "clipboard", {
  configurable: true,
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
});

const BACKUP_PASSWORD = "backup-password";
const PASSWORD = "hunter2hunter2";

const data = buildExportData(
  [{ id: "44444444-4444-4444-8444-444444444444", name: "Personal", kind: "personal" }],
  [
    {
      type: "login",
      id: "22222222-2222-4222-8222-222222222222",
      vaultId: "44444444-4444-4444-8444-444444444444",
      title: "Mail",
      createdAt: null,
      updatedAt: "2026-10-02T00:00:00.000Z",
    },
  ],
);

const previous = getPasswordKekParams();
beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
afterAll(() => setPasswordKekParams(previous));

beforeEach(() => {
  mockPersistent = true;
  store.profile = null;
  store.profiles = [profileEntry({ profileId: "p-old", mode: "local", email: null, userId: null })];
  restoreHook.restoreError = undefined;
  restoreHook.restore.mockResolvedValue(new Uint8Array(32).fill(1));
  restoreHook.finishRestore.mockResolvedValue({ created: 1, updated: 0, skipped: 0 });
});
afterEach(() => vi.clearAllMocks());

function renderPage() {
  const location = memoryLocation({ path: authPaths.restore, record: true });
  renderWithProviders(
    <Router hook={location.hook}>
      <RestoreBackupPage />
    </Router>,
  );
  return location;
}

function file(content: string, name = "passmgr-backup.json") {
  return new File([content], name, { type: "application/json" });
}

async function setUpVault() {
  await userEvent.type(screen.getByLabelText("Vault name"), "Restored");
  await userEvent.type(screen.getByLabelText("Password"), PASSWORD);
  await userEvent.type(screen.getByLabelText("Confirm password"), PASSWORD);
  await userEvent.click(screen.getByRole("button", { name: /restore vault/i }));
}

describe("RestoreBackupPage", () => {
  it("restores an encrypted backup next to the vaults already here", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText(/next to the ones already here/i)).toBeInTheDocument();

    await user.upload(
      screen.getByLabelText("Backup file"),
      file(await encryptExport(data, BACKUP_PASSWORD)),
    );
    await screen.findByText(/encrypted backup ·/i);

    await user.type(screen.getByLabelText("Backup password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await screen.findByText(/not your vault password/i);
    expect(screen.queryByText("Can't be restored")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Backup password"));
    await user.type(screen.getByLabelText("Backup password"), BACKUP_PASSWORD);
    await user.click(screen.getByRole("button", { name: /^continue$/i }));

    await screen.findByText("1 record(s) ready to restore");
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.queryByText(/isn't encrypted/i)).not.toBeInTheDocument();

    await setUpVault();
    await waitFor(() =>
      expect(restoreHook.restore).toHaveBeenCalledWith(data, PASSWORD, "Restored"),
    );

    await screen.findByText(/save your recovery key/i);
    await user.click(screen.getByRole("button", { name: /copy to clipboard/i }));
    await user.click(screen.getByRole("button", { name: /i saved it/i }));
    await waitFor(() => expect(restoreHook.finishRestore).toHaveBeenCalled());
  });

  it("opens a plain JSON export without a password and warns it isn't encrypted", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.upload(screen.getByLabelText("Backup file"), file(exportToJson(data)));

    await screen.findByText("1 record(s) ready to restore");
    expect(screen.getByText(/plain json export · not encrypted/i)).toBeInTheDocument();
    expect(screen.getByText(/this file isn't encrypted/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Vault name"), "Kept");
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Vault name")).toHaveValue("Kept");
  });

  it("refuses a file that isn't a backup and points to the import", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.upload(
      screen.getByLabelText("Backup file"),
      file("name,url,username,password\r\n", "Chrome Passwords.csv"),
    );

    await screen.findByText(/isn't a backup or export of this app/i);
    expect(screen.getByText("Can't be restored")).toBeInTheDocument();
    expect(screen.getByText(/coming from another password manager/i)).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });

  it("warns in a private window", async () => {
    mockPersistent = false;
    const user = userEvent.setup();
    renderPage();

    await user.upload(screen.getByLabelText("Backup file"), file(exportToJson(data)));

    await screen.findByText(/gone once you close this tab/i);
  });

  it("goes back to the unlock with vaults on the device", async () => {
    const user = userEvent.setup();
    const withVaults = renderPage();
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    expect(withVaults.history.at(-1)).toBe(authPaths.login);
  });

  it("goes back to welcome without vaults", async () => {
    store.profiles = [];
    const user = userEvent.setup();
    const location = renderPage();
    expect(screen.queryByText(/next to the ones already here/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^back$/i }));
    expect(location.history.at(-1)).toBe(authPaths.welcome);
  });
});
