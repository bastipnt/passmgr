import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "@/test/render";
import TrashPage from "./TrashPage";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@repo/ui/hooks/use-is-mobile", () => ({ useIsMobile: () => viewport.mobile }));

const mocks = vi.hoisted(() => ({
  restore: vi.fn(),
  purge: vi.fn(),
  emptyTrash: vi.fn(),
  records: [] as unknown[],
}));

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useTrash: () => ({
    records: mocks.records,
    ready: true,
    restore: mocks.restore,
    purge: mocks.purge,
    emptyTrash: mocks.emptyTrash,
    pending: false,
  }),
  useVaults: () => ({ getVault: () => undefined, hasSeveralVaults: false }),
}));

function trashed(recordId: string, title: string, writable = true) {
  return {
    recordId,
    vaultId: "v-personal",
    type: "note",
    title,
    note: "",
    version: 2,
    clientUpdatedAt: "2026-10-11T00:00:00.000Z",
    created_at: null,
    firstCreatedAt: null,
    schemaVersion: 1,
    deletedAt: "2026-10-11T00:00:00.000Z",
    writable,
  };
}

// Braces: a returned function would run as the hook's teardown.
beforeEach(() => {
  mocks.restore.mockReset();
  mocks.purge.mockReset();
  mocks.emptyTrash.mockReset();
  mocks.records = [];
  viewport.mobile = false;
});

describe("TrashPage", () => {
  it("says so when the trash is empty", () => {
    renderWithProviders(<TrashPage />);

    expect(screen.getByText("Trash is empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empty trash" })).toBeDisabled();
  });

  it("restores a deleted item", async () => {
    const record = trashed("r1", "Old note");
    mocks.records = [record];
    renderWithProviders(<TrashPage />);

    await userEvent.click(screen.getByRole("button", { name: "Restore Old note" }));

    expect(mocks.restore).toHaveBeenCalledWith(record);
  });

  it("deletes an item for good only once confirmed", async () => {
    mocks.records = [trashed("r1", "Old note")];
    renderWithProviders(<TrashPage />);

    await userEvent.click(screen.getByRole("button", { name: "Delete Old note for good" }));
    expect(mocks.purge).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/can't be undone/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete for good" }));

    expect(mocks.purge).toHaveBeenCalledWith(["r1"]);
  });

  it("empties the trash, without actions for read-only vaults", async () => {
    mocks.records = [trashed("r1", "Mine"), trashed("r2", "Shared", false)];
    renderWithProviders(<TrashPage />);

    expect(screen.queryByRole("button", { name: "Restore Shared" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Empty trash" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete 1 item for good?")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete for good" }));

    expect(mocks.emptyTrash).toHaveBeenCalled();
  });

  it("says how long ago an item was deleted", () => {
    mocks.records = [{ ...trashed("r1", "Old note"), deletedAt: new Date().toISOString() }];
    renderWithProviders(<TrashPage />);

    expect(screen.getByRole("list", { name: "1 item" })).toHaveTextContent("deleted just now");
  });

  it("deletes for good from a row's sheet on a phone", async () => {
    viewport.mobile = true;
    mocks.records = [trashed("r1", "Old note")];
    renderWithProviders(<TrashPage />);

    expect(screen.getByRole("button", { name: "Restore Old note" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More actions for Old note" }));
    const sheet = await screen.findByRole("dialog", { name: "Old note" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Delete for good" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Old note for good?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete for good" }));

    expect(mocks.purge).toHaveBeenCalledWith(["r1"]);
  });
});
