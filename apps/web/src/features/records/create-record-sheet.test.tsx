import type { DecryptedRecord } from "@repo/schema";
import { toast } from "@repo/ui";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders, screen, within } from "@/test/render";
import CreateRecordSheet from "./CreateRecordSheet";

// The tag field offers the tags in use, which live in the records context.
vi.mock("@repo/client/src/hooks/use-tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-tags")>()),
  useTags: () => [],
}));

const mocks = vi.hoisted(() => ({
  createRecord: vi.fn(),
  createOpts: undefined as undefined | { onError?: (error: Error) => void },
  vaultFilter: "all",
  writableVaults: [] as { vaultId: string; name: string; kind: string; role: string }[],
  records: [] as DecryptedRecord[],
  mobile: false,
}));

vi.mock("@repo/ui/hooks/use-is-mobile", () => ({
  useIsMobile: () => mocks.mobile,
  isMobile: () => mocks.mobile,
}));

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useCreateRecord: (opts: { onError?: (error: Error) => void }) => {
    mocks.createOpts = opts;
    return { createRecord: mocks.createRecord, createPending: false };
  },
}));
vi.mock("@repo/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/ui")>()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@repo/client/src/providers/SortedRecordsProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/providers/SortedRecordsProvider")>()),
  useSortedRecords: () => ({ vaultFilter: mocks.vaultFilter }),
}));
vi.mock("@repo/client/src/hooks/use-vaults", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-vaults")>()),
  useVaults: () => ({ writableVaults: mocks.writableVaults }),
}));

vi.mock("@repo/client/src/hooks/use-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-records")>()),
  useGetRecord: (recordId: string) => ({
    record: mocks.records.find((record) => record.recordId === recordId),
    ready: true,
  }),
}));

beforeEach(() => {
  mocks.createRecord.mockClear();
  vi.mocked(toast.error).mockClear();
  mocks.records = [];
  mocks.vaultFilter = "all";
  mocks.writableVaults = [];
  mocks.mobile = false;
});

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  renderWithProviders(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <CreateRecordSheet />
    </Router>,
  );
  return location;
}

describe("CreateRecordSheet", () => {
  it("starts at the type picker", () => {
    renderAt("/?new=");

    expect(screen.getByRole("heading", { name: "New item" })).toBeInTheDocument();
    for (const type of [
      "Login",
      "Credit card",
      "Identity",
      "Secure note",
      "SSH key",
      "API key",
      "Wi-Fi",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${type}\\b`) })).toBeInTheDocument();
    }
  });

  it("opens the picked type's form, keeping a prefilled title", async () => {
    renderAt("/?new=Home");

    await userEvent.click(screen.getByRole("link", { name: /^Wi-Fi\b/ }));

    expect(await screen.findByRole("heading", { name: "New Wi-Fi network" })).toBeInTheDocument();
    expect(screen.getByLabelText("Network name (SSID)")).toBeInTheDocument();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Home");
    expect(screen.getByRole("button", { name: "Create Wi-Fi network" })).toBeInTheDocument();
  });

  it("offers no vault picker with a single vault", () => {
    renderAt("/?new=&type=note");
    expect(screen.queryByRole("combobox", { name: "Vault" })).not.toBeInTheDocument();
  });

  it("creates into the vault in view, when there are several to write to", async () => {
    mocks.writableVaults = [
      { vaultId: "v-personal", name: "Personal", kind: "personal", role: "owner" },
      { vaultId: "v-work", name: "Work", kind: "shared", role: "owner" },
    ];
    mocks.vaultFilter = "v-work";
    renderAt("/?new=Wiki&type=note");

    expect(screen.getByRole("combobox", { name: "Vault" })).toHaveTextContent("Work");
    await userEvent.click(screen.getByRole("button", { name: "Create secure note" }));

    await vi.waitFor(() => expect(mocks.createRecord).toHaveBeenCalled());
    expect(mocks.createRecord.mock.calls[0]![1]).toBe("v-work");
  });

  it("reports a failed save", () => {
    renderAt("/?new=&type=note");
    mocks.createOpts?.onError?.(new Error("disk full"));
    expect(toast.error).toHaveBeenCalledWith("The item couldn't be saved");
  });

  describe("on a phone", () => {
    beforeEach(() => {
      mocks.mobile = true;
    });

    it("creates from the page bar", async () => {
      renderAt("/?new=Home&type=wifi");

      expect(screen.getByRole("heading", { name: "New Wi-Fi network" })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Create" }));
      await vi.waitFor(() => expect(mocks.createRecord).toHaveBeenCalled());
    });

    it("keeps the way back to the type picker in the form", async () => {
      const location = renderAt("/?new=Home&type=wifi");

      const form = screen.getByRole("textbox", { name: "Title" }).closest("form") as HTMLElement;
      await userEvent.click(within(form).getByRole("button", { name: "Type" }));
      expect(location.history.at(-1)).toBe("?new=Home");
    });

    it("puts the SSH key buttons above the private key", () => {
      renderAt("/?new=&type=ssh_key");

      const newKey = screen.getByRole("button", { name: "New key" });
      const privateKey = screen.getByLabelText("Private key");
      expect(
        newKey.compareDocumentPosition(privateKey) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Import file" })).toBeInTheDocument();
    });
  });

  describe("as a duplicate", () => {
    const source = {
      recordId: "r-1",
      vaultId: "v-work",
      type: "note",
      title: "Wiki",
      note: "body",
      favorite: true,
    } as DecryptedRecord;

    it("starts from a copy of the record, in its vault", async () => {
      mocks.records = [source];
      mocks.writableVaults = [
        { vaultId: "v-personal", name: "Personal", kind: "personal", role: "owner" },
        { vaultId: "v-work", name: "Work", kind: "shared", role: "owner" },
      ];
      renderAt("/record/r-1?new=&duplicate=r-1");

      expect(screen.getByRole("heading", { name: "Duplicate secure note" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Wiki (copy)");
      expect(screen.queryByRole("button", { name: "Type" })).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Vault" })).toHaveTextContent("Work");

      await userEvent.click(screen.getByRole("button", { name: "Create secure note" }));
      await vi.waitFor(() => expect(mocks.createRecord).toHaveBeenCalled());
      const [record, vaultId] = mocks.createRecord.mock.calls[0]!;
      expect(record).toMatchObject({ type: "note", title: "Wiki (copy)", note: "body" });
      expect(record.favorite).toBeUndefined();
      expect(vaultId).toBe("v-work");
    });

    it("closes when the record is gone", async () => {
      const location = renderAt("/record/r-1?new=&duplicate=r-1");

      expect(toast.error).toHaveBeenCalledWith("This item is no longer available");
      await vi.waitFor(() => expect(location.history.at(-1)).toBe("/record/r-1"));
    });
  });
});
