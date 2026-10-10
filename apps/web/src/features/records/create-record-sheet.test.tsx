import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders, screen } from "@/test/render";
import CreateRecordSheet from "./CreateRecordSheet";

const mocks = vi.hoisted(() => ({
  createRecord: vi.fn(),
  vaultFilter: "all",
  writableVaults: [] as { vaultId: string; name: string; kind: string; role: string }[],
}));

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useCreateRecord: () => ({ createRecord: mocks.createRecord, createPending: false }),
  useSortedRecords: () => ({ vaultFilter: mocks.vaultFilter }),
  useVaults: () => ({ writableVaults: mocks.writableVaults }),
}));

beforeEach(() => {
  mocks.createRecord.mockClear();
  mocks.vaultFilter = "all";
  mocks.writableVaults = [];
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
});
