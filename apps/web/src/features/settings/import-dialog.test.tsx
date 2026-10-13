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
  stopped: undefined as { written: number; total: number } | undefined,
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
afterEach(() => {
  vi.clearAllMocks();
  importHook.importError = undefined;
  importHook.stopped = undefined;
});

function file(content: string, name = "backup.json") {
  return new File([content], name, {
    type: name.endsWith(".csv") ? "text/csv" : "application/json",
  });
}

const CHROME_CSV = "name,url,username,password,note\r\nMail,https://mail.example.com,a,pw,\r\n";

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

    await user.upload(screen.getByLabelText("Export file"), file(exportToJson(data)));
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
      screen.getByLabelText("Export file"),
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

    await user.upload(screen.getByLabelText("Export file"), file(exportToJson(data)));
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
    const read = vi.spyOn(huge, "arrayBuffer");

    await user.upload(screen.getByLabelText("Export file"), huge);

    expect(await screen.findByText(/too large/)).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a file that isn't an export", async () => {
    const user = await openDialog();

    await user.upload(screen.getByLabelText("Export file"), file('{"hello":"world"}'));

    expect(await screen.findByText(/can't import this file/)).toBeInTheDocument();
  });

  it("says how to export a file it can't read", async () => {
    const user = await openDialog();

    await user.upload(
      screen.getByLabelText("Export file"),
      file("folder,favorite,type,name,login_uri,login_username\n", "bitwarden.csv"),
    );

    expect(await screen.findByText(/Export your vault as “.json” instead/)).toBeInTheDocument();
  });

  it("imports another app's export as new items into the picked vault, then reports", async () => {
    store.vault.getVaults.mockResolvedValue([
      { vaultId: PERSONAL, kind: "personal", role: "owner" } as MemberVault,
      { vaultId: WORK, kind: "shared", role: "write" } as MemberVault,
    ]);
    const user = await openDialog();

    await user.upload(screen.getByLabelText("Export file"), file(CHROME_CSV, "chrome.csv"));
    expect(await screen.findByText(/Chrome \/ Edge export: 1 login\./)).toBeInTheDocument();
    await user.click(await screen.findByRole("combobox", { name: "Import into" }));
    await user.click(await screen.findByRole("option", { name: "Vault" }));
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(importHook.importData).toHaveBeenCalledTimes(1));
    const [imported, options] = importHook.importData.mock.calls[0]!;
    expect(imported.records).toMatchObject([{ title: "Mail", username: "a", password: "pw" }]);
    expect(options).toEqual({
      vaultMap: { [imported.vaults[0].id]: WORK },
      fallbackVaultId: WORK,
      duplicates: "keep-both",
    });
    expect(await screen.findByText(/Imported 1 item from Chrome/)).toBeInTheDocument();
    expect(screen.getByText(/Delete it now/)).toBeInTheDocument();
  });

  it("says how far a failed import got", async () => {
    importHook.importData.mockResolvedValue(null);
    importHook.importError = "failed";
    importHook.stopped = { written: 100, total: 250 };
    const user = await openDialog();

    await user.upload(screen.getByLabelText("Export file"), file(CHROME_CSV, "chrome.csv"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/Imported 100 of 250 items/)).toBeInTheDocument();
  });
});
