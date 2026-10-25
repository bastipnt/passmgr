import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "@/test/render";
import { FilterSheet } from "./FilterSheet";

vi.mock("@repo/ui/hooks/use-is-mobile", () => ({ useIsMobile: () => true }));

function makeRecord(id: string, data: RecordData): DecryptedRecord {
  return {
    ...data,
    schemaVersion: 1,
    recordId: id,
    vaultId: "v1",
    version: 1,
    clientUpdatedAt: "2026-10-01T10:00:00.000Z",
    created_at: null,
    firstCreatedAt: null,
  } as DecryptedRecord;
}

const records = vi.hoisted(() => [] as DecryptedRecord[]);
records.push(
  makeRecord("github", { type: "login", title: "GitHub", tags: ["work", "infra"] }),
  makeRecord("jira", { type: "login", title: "Jira", tags: ["work"] }),
  makeRecord("bank", { type: "login", title: "Bank", tags: ["finance"] }),
  makeRecord("visa", { type: "card", title: "Visa", number: "4111111111111111", tags: ["work"] }),
);

vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records, ready: true, recordsNumber: records.length }),
}));
vi.mock("@repo/client/src/hooks/use-vaults", () => ({
  useVaults: () => ({ getVault: (vaultId: string) => ({ vaultId }) }),
}));

const onOpenChange = vi.fn();

function ListedIds() {
  const { sortedRecords } = useSortedRecords();
  return (
    <output aria-label="Listed">
      {sortedRecords
        .map((r) => r.recordId)
        .sort()
        .join(",")}
    </output>
  );
}

function renderSheet() {
  renderWithProviders(
    <SortedRecordsProvider>
      <ListedIds />
      <FilterSheet open onOpenChange={onOpenChange} />
    </SortedRecordsProvider>,
  );
}

const listed = () =>
  // The modal sheet hides the rest of the page from the a11y tree.
  screen.getByRole("status", { name: "Listed", hidden: true }).textContent;
const tags = () => within(screen.getByRole("region", { name: "Tags" }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("FilterSheet", () => {
  it("a category tile picks the category, live", async () => {
    renderSheet();
    expect(screen.getByRole("button", { name: "Show 4 items" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cards (1)" }));
    expect(screen.getByRole("button", { name: "Cards (1)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(listed()).toBe("visa");
    expect(screen.getByRole("button", { name: "Show 1 credit card" })).toBeInTheDocument();
  });

  it("several tags combine: a record must carry each", async () => {
    renderSheet();
    await userEvent.click(tags().getByRole("button", { name: "work (3)" }));
    expect(listed()).toBe("github,jira,visa");

    await userEvent.click(tags().getByRole("button", { name: "infra (1)" }));
    expect(listed()).toBe("github");
    expect(screen.getByRole("button", { name: "Show 1 item" })).toBeInTheDocument();
    expect(tags().getByRole("button", { name: "finance (0)" })).toBeDisabled();

    await userEvent.click(tags().getByRole("button", { name: "Remove tag infra" }));
    expect(listed()).toBe("github,jira,visa");
  });

  it("Reset clears the category and the tags", async () => {
    renderSheet();
    const reset = screen.getByRole("button", { name: "Reset" });
    expect(reset).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Logins (3)" }));
    await userEvent.click(tags().getByRole("button", { name: "work (2)" }));
    expect(listed()).toBe("github,jira");

    await userEvent.click(reset);
    expect(listed()).toBe("bank,github,jira,visa");
    expect(screen.getByRole("button", { name: "All items (4)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(reset).toBeDisabled();
  });

  it("the Show button only closes", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Show 4 items" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(listed()).toBe("bank,github,jira,visa");
  });
});
