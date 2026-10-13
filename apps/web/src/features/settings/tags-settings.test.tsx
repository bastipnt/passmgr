import type { DecryptedRecord, RecordData } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import TagsSettingsPage from "./TagsSettingsPage";

type Update = { record: { recordId: string; vaultId: string }; data: RecordData };

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(async (_updates: Update[]) => []),
  reload: vi.fn(async () => {}),
  records: [] as DecryptedRecord[],
  /** Tags of a head newer than the list's copy. */
  stored: new Map<string, string[]>(),
  deleted: new Set<string>(),
}));

vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records: mocks.records, ready: true, recordsNumber: 0 }),
  useReloadRecords: () => mocks.reload,
}));
vi.mock("@repo/client/src/hooks/use-vaults", () => ({
  useVaults: () => ({
    getVault: (vaultId: string) => ({ vaultId, role: vaultId === "v-read" ? "read" : "write" }),
  }),
}));
vi.mock("@repo/client/src/providers/StoreProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/providers/StoreProvider")>()),
  useStore: () => ({}),
  requireActive: () => ({
    records: {
      updateMany: mocks.updateMany,
      // The stored head: what the edit is built from.
      getById: async (recordId: string) => {
        const record = mocks.records.find((own) => own.recordId === recordId);
        return record && { ...record, deleted_at: mocks.deleted.has(recordId) ? "now" : null };
      },
    },
  }),
}));
vi.mock("@repo/client/src/util/decrypt-record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/util/decrypt-record")>()),
  decryptRecord: (row: DecryptedRecord) => ({
    type: row.type,
    title: row.title,
    tags: mocks.stored.get(row.recordId) ?? row.tags,
    schemaVersion: 1,
  }),
}));

function makeRecord(recordId: string, vaultId: string, tags: string[]): DecryptedRecord {
  return {
    type: "note",
    title: recordId,
    tags,
    schemaVersion: 1,
    recordId,
    vaultId,
    version: 1,
    clientUpdatedAt: "2026-10-01T10:00:00.000Z",
    created_at: null,
    firstCreatedAt: null,
  } as DecryptedRecord;
}

const written = () =>
  (mocks.updateMany.mock.calls[0]?.[0] ?? []).map(({ record, data }) => [
    record.recordId,
    data.tags,
  ]);

beforeEach(() => {
  mocks.updateMany.mockClear();
  mocks.reload.mockClear();
  mocks.stored.clear();
  mocks.deleted.clear();
  mocks.records = [
    makeRecord("a", "v1", ["work", "home"]),
    makeRecord("b", "v1", ["Work"]),
    makeRecord("c", "v-read", ["work"]),
    makeRecord("d", "v1", ["home"]),
  ];
});

describe("TagsSettingsPage", () => {
  it("lists every tag with its count", () => {
    renderWithProviders(<TagsSettingsPage />);

    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("says how to add tags when there are none", () => {
    mocks.records = [];
    renderWithProviders(<TagsSettingsPage />);

    expect(screen.getByText(/No tags yet/)).toBeInTheDocument();
  });

  it("renames a tag on every writable record, merging into a tag already there", async () => {
    renderWithProviders(<TagsSettingsPage />);

    await userEvent.click(screen.getByRole("button", { name: "Rename work" }));
    const name = screen.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Home");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => expect(mocks.updateMany).toHaveBeenCalledTimes(1));
    // "c" is in a read-only vault: left as it is.
    expect(written()).toEqual([
      ["a", ["Home"]],
      ["b", ["Home"]],
    ]);
    expect(mocks.reload).toHaveBeenCalled();
  });

  it("edits the stored version, skipping one that no longer has the tag or is deleted", async () => {
    mocks.stored.set("a", ["work", "home", "synced"]);
    mocks.stored.set("b", ["other"]);
    mocks.deleted.add("d");
    renderWithProviders(<TagsSettingsPage />);

    await userEvent.click(screen.getByRole("button", { name: "Remove home" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove tag" }));

    await waitFor(() => expect(mocks.updateMany).toHaveBeenCalledTimes(1));
    expect(written()).toEqual([["a", ["work", "synced"]]]);
  });

  it("refuses a name the form would refuse", async () => {
    renderWithProviders(<TagsSettingsPage />);

    await userEvent.click(screen.getByRole("button", { name: "Rename work" }));
    const name = screen.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "a,b");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(await screen.findByText("A tag can't contain a comma")).toBeInTheDocument();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("removes a tag from every writable record, dropping an emptied list", async () => {
    renderWithProviders(<TagsSettingsPage />);

    await userEvent.click(screen.getByRole("button", { name: "Remove work" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove tag" }));

    await waitFor(() => expect(mocks.updateMany).toHaveBeenCalledTimes(1));
    expect(written()).toEqual([
      ["a", ["home"]],
      ["b", undefined],
    ]);
  });
});
