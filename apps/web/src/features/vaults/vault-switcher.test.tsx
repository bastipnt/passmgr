import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { settingsPaths } from "@/app/route-paths";
import { renderWithProviders, screen, waitFor } from "@/test/render";
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
vi.mock("./VaultDialog", () => ({
  VaultDialog: ({ open }: { open: boolean }) => (open ? <dialog open>New vault</dialog> : null),
}));
vi.mock("@repo/ui/hooks/use-is-mobile", () => ({ useIsMobile: () => true }));
// jsdom has no `CSS.supports`; the pill's collapse is out of scope here.
vi.mock("@repo/ui/hooks/use-scroll-collapse", () => ({ useScrollCollapse: () => {} }));

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

function renderSwitcher(variant: "scope" | "pill" = "scope") {
  const location = memoryLocation({ path: "/", record: true });
  renderWithProviders(
    <Router hook={location.hook}>
      <SortedRecordsProvider>
        <VaultSwitcher variant={variant} />
        <ListProbe />
      </SortedRecordsProvider>
    </Router>,
  );
  return location;
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

describe("phone vault sheet", () => {
  const sheet = () => screen.getByRole("dialog");

  it("lists every vault with its item count, a check on the current one", async () => {
    renderSwitcher("pill");
    await userEvent.click(screen.getByRole("button", { name: "Vault: All vaults" }));

    const all = await screen.findByRole("button", { name: /^All vaults\s*3 items/ });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Personal\s*2 items/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /^Koch Studio\s*1 item$/ })).toBeInTheDocument();
  });

  it("a pick scopes the list, resets the category and closes the sheet", async () => {
    const user = userEvent.setup();
    renderSwitcher("pill");
    await user.click(screen.getByRole("button", { name: "Cards" }));
    expect(category()).toBe("card");

    await user.click(screen.getByRole("button", { name: "Vault: All vaults" }));
    await user.click(await screen.findByRole("button", { name: /^Koch Studio/ }));

    expect(category()).toBe("all");
    expect(shown()).toEqual(["Hetzner"]);
    expect(screen.getByRole("button", { name: "Vault: Koch Studio" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Manage opens the vault settings", async () => {
    const location = renderSwitcher("pill");
    await userEvent.click(screen.getByRole("button", { name: "Vault: All vaults" }));
    await userEvent.click(await screen.findByRole("button", { name: "Manage" }));
    await waitFor(() => expect(location.history.at(-1)).toBe(settingsPaths.vaults));
  });

  it("New vault closes the sheet for the create dialog", async () => {
    renderSwitcher("pill");
    await userEvent.click(screen.getByRole("button", { name: "Vault: All vaults" }));
    expect(sheet()).toHaveTextContent("Vaults");
    await userEvent.click(await screen.findByRole("button", { name: "New vault" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent(/^New vault$/));
  });
});
