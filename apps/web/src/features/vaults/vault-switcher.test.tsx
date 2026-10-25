import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders, screen } from "@/test/render";
import { VaultSwitcher } from "./VaultSwitcher";

function makeRecord(id: string, vaultId: string, data: RecordData): DecryptedRecord {
  return {
    ...data,
    schemaVersion: 1,
    recordId: id,
    vaultId,
    version: 1,
    clientUpdatedAt: "2026-10-01T10:00:00.000Z",
    created_at: null,
    firstCreatedAt: null,
  } as DecryptedRecord;
}

const records = vi.hoisted(() => [] as DecryptedRecord[]);
records.push(
  makeRecord("github", "personal", { type: "login", title: "GitHub", username: "octo" }),
  makeRecord("visa", "personal", { type: "card", title: "Visa", number: "4111111111111111" }),
  makeRecord("hetzner", "studio", { type: "login", title: "Hetzner", username: "ops" }),
);

vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records, ready: true, recordsNumber: records.length }),
}));

const vaults = vi.hoisted(() => [
  { vaultId: "personal", name: "Personal", kind: "personal", role: "owner" },
  { vaultId: "studio", name: "Koch Studio", kind: "shared", role: "owner" },
]);
vi.mock("@repo/client/src/hooks/use-vaults", () => ({
  useVaults: () => ({
    vaults,
    getVault: (vaultId: string) => vaults.find((vault) => vault.vaultId === vaultId),
  }),
  useVaultRecordCounts: () =>
    new Map([
      ["personal", 2],
      ["studio", 1],
    ]),
  useVaultActions: () => ({ canChangeVaults: true }),
}));
vi.mock("./VaultDialog", () => ({ VaultDialog: () => null }));

function ListProbe() {
  const { sortedRecords, categoryFilter, setCategoryFilter } = useSortedRecords();
  return (
    <>
      <button type="button" onClick={() => setCategoryFilter("card")}>
        Cards
      </button>
      <output aria-label="category">{categoryFilter}</output>
      <ul aria-label="records">
        {sortedRecords.map((record) => (
          <li key={record.recordId}>{record.title}</li>
        ))}
      </ul>
    </>
  );
}

function renderSwitcher() {
  return renderWithProviders(
    <Router hook={memoryLocation({ path: "/" }).hook}>
      <SortedRecordsProvider>
        <VaultSwitcher variant="scope" />
        <ListProbe />
      </SortedRecordsProvider>
    </Router>,
  );
}

const shown = () =>
  Array.from(
    screen.getByRole("list", { name: "records" }).querySelectorAll("li"),
    (item) => item.textContent,
  ).sort();
const category = () => screen.getByRole("status", { name: "category" }).textContent;

beforeEach(() => localStorage.clear());

describe("header vault scope switcher", () => {
  it("lists every vault with its item count", async () => {
    renderSwitcher();
    await userEvent.click(screen.getByRole("button", { name: "Vault: All vaults" }));

    expect(
      await screen.findByRole("menuitemradio", { name: /All vaults\s*3/ }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("menuitemradio", { name: /Personal\s*2/ })).toBeInTheDocument();
    expect(
      await screen.findByRole("menuitemradio", { name: /Koch Studio\s*1/ }),
    ).toBeInTheDocument();
  });

  it("a pick scopes the list to that vault and resets the category", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    expect(shown()).toEqual(["GitHub", "Hetzner", "Visa"]);

    await user.click(screen.getByRole("button", { name: "Vault: All vaults" }));
    await user.click(await screen.findByRole("menuitemradio", { name: /Personal/ }));
    expect(shown()).toEqual(["GitHub", "Visa"]);

    await user.click(screen.getByRole("button", { name: "Cards" }));
    expect(shown()).toEqual(["Visa"]);

    await user.click(await screen.findByRole("button", { name: "Vault: Personal" }));
    await user.click(await screen.findByRole("menuitemradio", { name: /Koch Studio/ }));
    expect(category()).toBe("all");
    expect(shown()).toEqual(["Hetzner"]);
    expect(screen.getByRole("button", { name: "Vault: Koch Studio" })).toBeInTheDocument();
  });
});
