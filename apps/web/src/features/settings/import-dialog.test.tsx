import { buildExportData, encryptExport, exportToJson, MAX_IMPORT_FILE_BYTES } from "@repo/client";
import { getPasswordKekParams, setPasswordKekParams } from "@repo/crypto";
import type { MemberVault } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { Button } from "@repo/ui/components/Button";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import ImportDialog from "./ImportDialog";

const importHook = vi.hoisted(() => ({
  importData: vi.fn(),
  busy: false,
  importError: undefined as "failed" | undefined,
  clearImportError: vi.fn(),
}));
vi.mock("@repo/client/src/hooks/use-import", async (importActual) => ({
  ...(await importActual<object>()),
  useImport: () => importHook,
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

const PERSONAL = "11111111-1111-4111-8111-111111111111";
const OLD_VAULT = "44444444-4444-4444-8444-444444444444";
const WORK = "55555555-5555-4555-8555-555555555555";
const READ_ONLY = "66666666-6666-4666-8666-666666666666";

const data = buildExportData(
  [{ id: OLD_VAULT, name: "Old personal", kind: "personal" }],
  [
    {
      type: "login",
      id: "22222222-2222-4222-8222-222222222222",
      vaultId: OLD_VAULT,
      title: "Mail",
      createdAt: null,
      updatedAt: "2026-10-02T00:00:00.000Z",
    },
  ],
  new Date("2026-10-08T12:00:00.000Z"),
);

const previous = getPasswordKekParams();
beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
afterAll(() => setPasswordKekParams(previous));

beforeEach(() => {
  store.profile = { profileId: "p-local", mode: "local", email: null, userId: null };
  store.profiles = [profileEntry(store.profile)];
  store.vault.getVaults.mockResolvedValue([
    { vaultId: PERSONAL, kind: "personal", role: "owner" } as MemberVault,
  ]);
  vi.spyOn(secretsStore, "defaultVaultId", "get").mockReturnValue(PERSONAL);
  importHook.importData.mockResolvedValue({ created: 1, updated: 0, skipped: 0 });
});
afterEach(() => vi.clearAllMocks());

function file(content: string) {
  return new File([content], "backup.json", { type: "application/json" });
}

async function openDialog() {
  const user = userEvent.setup();
  renderWithProviders(
    <ImportDialog>
      <Button>Import</Button>
    </ImportDialog>,
  );
  await user.click(screen.getByRole("button", { name: "Import" }));
  return user;
}

describe("ImportDialog", () => {
  it("imports a plain JSON export into the personal vault, skipping duplicates", async () => {
    const user = await openDialog();

    await user.upload(screen.getByLabelText("Backup file"), file(exportToJson(data)));
    await screen.findByText(/1 record\(s\)/);
    await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() =>
      expect(importHook.importData).toHaveBeenCalledWith(data, {
        vaultMap: { [OLD_VAULT]: PERSONAL },
        fallbackVaultId: PERSONAL,
        duplicates: "skip",
      }),
    );
    await waitFor(() => expect(screen.queryByText(/1 record\(s\)/)).not.toBeInTheDocument());
  });

  it("asks for the backup password of an encrypted backup", async () => {
    const user = await openDialog();

    await user.upload(
      screen.getByLabelText("Backup file"),
      file(await encryptExport(data, "backup password")),
    );
    await user.type(await screen.findByLabelText("Backup password"), "not it");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/doesn't open this file/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Backup password"));
    await user.type(screen.getByLabelText("Backup password"), "backup password");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/1 record\(s\)/)).toBeInTheDocument();
  });

  it("lets the user pick a writable vault and keep duplicates", async () => {
    // No name metadata: the dialog falls back to "Personal" / "Vault".
    store.vault.getVaults.mockResolvedValue([
      { vaultId: PERSONAL, kind: "personal", role: "owner" } as MemberVault,
      { vaultId: WORK, kind: "shared", role: "write" } as MemberVault,
      { vaultId: READ_ONLY, kind: "shared", role: "read" } as MemberVault,
    ]);
    const user = await openDialog();

    await user.upload(screen.getByLabelText("Backup file"), file(exportToJson(data)));
    await user.click(await screen.findByRole("combobox", { name: "“Old personal” goes to" }));
    // The read-only vault isn't offered.
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "Personal",
      "Vault",
    ]);
    await user.click(screen.getByRole("option", { name: "Vault" }));
    await user.click(screen.getByRole("combobox", { name: /Records already in this vault/ }));
    await user.click(await screen.findByRole("option", { name: "Keep both" }));
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() =>
      expect(importHook.importData).toHaveBeenCalledWith(data, {
        vaultMap: { [OLD_VAULT]: WORK },
        fallbackVaultId: PERSONAL,
        duplicates: "keep-both",
      }),
    );
  });

  it("doesn't read a file over the size limit", async () => {
    const user = await openDialog();
    const huge = file("{}");
    Object.defineProperty(huge, "size", { value: MAX_IMPORT_FILE_BYTES + 1 });
    const text = vi.spyOn(huge, "text");

    await user.upload(screen.getByLabelText("Backup file"), huge);

    expect(await screen.findByText(/too large/)).toBeInTheDocument();
    expect(text).not.toHaveBeenCalled();
  });

  it("refuses a file that isn't an export", async () => {
    const user = await openDialog();

    await user.upload(screen.getByLabelText("Backup file"), file('{"hello":"world"}'));

    expect(await screen.findByText(/isn't a backup or export/)).toBeInTheDocument();
  });
});
