import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordPaths } from "@/app/route-paths";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { MobileSearchButton, MobileSearchOverlay, useMobileSearch } from "./MobileSearch";

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
  makeRecord("github", { type: "login", title: "GitHub", username: "octo", tags: ["work"] }),
  makeRecord("fineco", { type: "login", title: "Fineco Bank", username: "me", tags: ["finance"] }),
);

vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records, ready: true, recordsNumber: records.length }),
}));
vi.mock("@repo/client/src/hooks/use-vaults", () => ({
  useVaults: () => ({ getVault: () => ({ vaultId: "v1" }), vaults: [] }),
}));

function TagFilters() {
  return <output aria-label="Tag filters">{useSortedRecords().tagFilters.join(",")}</output>;
}

/** Stands in for the record page, which notes the record it shows (`MobileRecordPage`). */
function OpenFineco() {
  const { noteOpened } = useSortedRecords();
  return (
    <button type="button" onClick={() => noteOpened("fineco")}>
      Note Fineco opened
    </button>
  );
}

function Harness() {
  const search = useMobileSearch();
  return (
    <>
      <MobileSearchButton onOpen={search.openSearch} />
      <MobileSearchOverlay state={search} />
      <TagFilters />
      <OpenFineco />
    </>
  );
}

function renderSearch() {
  renderWithProviders(
    <SortedRecordsProvider>
      <Harness />
    </SortedRecordsProvider>,
  );
}

const field = () => screen.getByRole("combobox", { name: "Search vault", hidden: true });
// Closed, the dialog is inert, which hides it from role queries.
const dialog = () => document.querySelector('[role="dialog"][aria-label="Search"]');

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear();
  history.replaceState(null, "", "/");
});

describe("MobileSearch", () => {
  it("opens over the list with the field focused, in its own history entry", async () => {
    renderSearch();
    expect(dialog()).toHaveAttribute("aria-hidden", "true");

    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(dialog()).not.toHaveAttribute("aria-hidden", "true");
    expect(field()).toHaveFocus();
    expect(history.state).toMatchObject({ mobileSearch: { tagsBefore: [] } });
  });

  it("type → results → tap a record opens it; Back from it returns to the same search", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(field(), "git");

    expect(screen.getByText("1 result")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /GitHub/ }));
    expect(location.pathname).toBe(recordPaths.record("github"));

    history.back();
    await waitFor(() => expect(location.pathname).toBe("/"));
    expect(dialog()).not.toHaveAttribute("aria-hidden", "true");
    expect(field()).toHaveValue("git");
  });

  it("a tag row adds the filter; Cancel clears the query and puts the filters back", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(field(), "fin");
    await userEvent.click(screen.getByRole("option", { name: /^finance/ }));

    expect(screen.getByRole("status", { name: "Tag filters" })).toHaveTextContent("finance");
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();

    await userEvent.type(field(), "bank");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog()).toHaveAttribute("aria-hidden", "true"));
    expect(field()).toHaveValue("");
    expect(screen.getByRole("status", { name: "Tag filters" })).toHaveTextContent("");
  });

  it("a search that opened a record comes back as a recent search, restoring its text and tags", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("option", { name: /^finance/ }));
    await userEvent.type(field(), "fin");
    await userEvent.click(screen.getByRole("option", { name: /Fineco/ }));

    history.back();
    await waitFor(() => expect(location.pathname).toBe("/"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog()).toHaveAttribute("aria-hidden", "true"));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    const recent = screen.getByRole("region", { name: "Recent searches" });
    expect(recent).toHaveTextContent("fin + #finance1 result");
    expect(recent).toHaveTextContent("#financeTag filter · 1 item");

    await userEvent.click(screen.getByRole("button", { name: /^fin \+ #finance/ }));
    expect(field()).toHaveValue("fin");
    expect(field()).toHaveFocus();
    expect(screen.getByRole("status", { name: "Tag filters" })).toHaveTextContent("finance");

    await userEvent.clear(field());
    await userEvent.click(screen.getByRole("button", { name: "Remove #finance" }));
    expect(screen.getByRole("region", { name: "Recent searches" })).not.toHaveTextContent(
      "Tag filter",
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("region", { name: "Recent searches" })).toBeNull();
  });

  it("the search key opens the only matching record, never a recent one on an empty field", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(field(), "fineco{Enter}");
    expect(location.pathname).toBe(recordPaths.record("fineco"));

    history.back();
    await waitFor(() => expect(location.pathname).toBe("/"));
    await userEvent.click(screen.getByRole("button", { name: "Note Fineco opened", hidden: true }));
    await userEvent.clear(field());
    expect(screen.getByRole("group", { name: "Recently opened" })).toBeInTheDocument();
    await userEvent.type(field(), "{Enter}");
    expect(location.pathname).toBe("/");
  });
});
