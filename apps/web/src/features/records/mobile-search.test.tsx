import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import { holdKeyboard } from "@repo/ui/lib/keyboard-handoff";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordPaths } from "@/app/route-paths";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";
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

/** Stands in for the filter sheet (`FilterSheet`), where a phone picks its tags. */
function TagFilters() {
  const { tagFilters, categoryFilter, setCategoryFilter, toggleTag } = useSortedRecords();
  return (
    <>
      <output aria-label="Tag filters">{tagFilters.join(",")}</output>
      <output aria-label="Category">{categoryFilter}</output>
      <button type="button" onClick={() => setCategoryFilter("login")}>
        Show logins
      </button>
      <button type="button" onClick={() => toggleTag("finance")}>
        Filter finance
      </button>
      <button type="button" onClick={() => toggleTag("work")}>
        Filter work
      </button>
    </>
  );
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
  return renderWithProviders(
    <SortedRecordsProvider>
      <Harness />
    </SortedRecordsProvider>,
  );
}

const field = () => screen.getByRole("combobox", { name: "Search vault", hidden: true });
// Closed, the dialog is inert, which hides it from role queries.
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Search"]');

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

  it("lists records only: a record whose tag matches, no tag rows or pills", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByRole("group", { name: "Top tags" })).toBeNull();

    await userEvent.type(field(), "work");
    expect(screen.queryByRole("group", { name: "Tags" })).toBeNull();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      expect.stringContaining("GitHub"),
    ]);
    expect(screen.getByText("1 result")).toBeInTheDocument();
  });

  it("no # tag mode: a leading # is dropped and the rest searched as usual", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(field(), "#");
    expect(screen.queryByRole("group", { name: "Narrow further" })).toBeNull();

    await userEvent.type(field(), "fin");
    expect(field()).toHaveValue("#fin");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      expect.stringContaining("Fineco"),
    ]);
    expect(field()).toHaveAttribute("enterkeyhint", "search");
  });

  it("Cancel clears the query and puts the filters back", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("button", { name: "Filter finance", hidden: true }));
    expect(screen.getByRole("status", { name: "Tag filters" })).toHaveTextContent("finance");

    await userEvent.type(field(), "bank");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog()).toHaveAttribute("aria-hidden", "true"));
    expect(field()).toHaveValue("");
    expect(screen.getByRole("status", { name: "Tag filters" })).toHaveTextContent("");
  });

  it("a search that opened a record comes back as a recent search, restoring its text and tags", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("button", { name: "Filter finance", hidden: true }));
    await userEvent.type(field(), "fin");
    await userEvent.click(screen.getByRole("option", { name: /Fineco/ }));

    history.back();
    await waitFor(() => expect(location.pathname).toBe("/"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog()).toHaveAttribute("aria-hidden", "true"));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    const recent = screen.getByRole("region", { name: "Recent searches" });
    expect(recent).toHaveTextContent("fin + #finance1 result");

    await userEvent.click(screen.getByRole("button", { name: /^fin \+ #finance/ }));
    expect(field()).toHaveValue("fin");
    expect(field()).toHaveFocus();
    expect(screen.getByRole("status", { name: "Tag filters" })).toHaveTextContent("finance");

    await userEvent.clear(field());
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

describe("MobileSearch focus and filters", () => {
  it("a tap that loses the field anyway (iOS) focuses it again", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(field(), "git");
    const clear = screen.getByRole("button", { name: "Clear search" });

    fireEvent.pointerDown(clear);
    field().blur();
    fireEvent.click(clear);
    expect(field()).toHaveFocus();
  });

  it("back on the search from a record focuses the field, taking over a keyboard held in the Back tap", () => {
    history.replaceState(
      { mobileSearch: { tagsBefore: [], categoryBefore: "all", scrollY: 0 } },
      "",
      "/",
    );
    holdKeyboard();
    expect(document.activeElement).not.toBe(document.body);

    renderSearch();
    expect(field()).toHaveFocus();
  });

  it("landing on the plain list instead lets a held keyboard go", () => {
    holdKeyboard();
    const standIn = document.activeElement;
    renderSearch();
    expect(standIn?.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});

describe("MobileSearch tag filters", () => {
  const scope = () => screen.getByRole("list", { name: "Search scope" });

  it("picked tags show in the scope, not in the field, with their records listed", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Filter finance" }));
    await userEvent.click(screen.getByRole("button", { name: "Filter work" }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(scope()).toHaveTextContent("#finance");
    expect(scope()).toHaveTextContent("#work");
    expect(field()).toHaveAttribute("placeholder", "Search logins, notes, tags");
    expect(screen.queryByRole("button", { name: /from search/ })).toBeNull();
  });

  it("Search all items runs past the tags and category for the query, keeping them picked", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Show logins" }));
    await userEvent.click(screen.getByRole("button", { name: "Filter finance" }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
    await userEvent.type(field(), "fin");

    const [scopeSearchAll] = screen.getAllByRole("button", { name: "Search all items" });
    if (scopeSearchAll) await userEvent.click(scopeSearchAll);
    expect(scope()).toHaveTextContent("All items");
    expect(scope()).not.toHaveTextContent("#finance");
    expect(field()).toHaveFocus();
    expect(screen.getByRole("status", { name: "Tag filters" })).toHaveTextContent("finance");
    expect(screen.getByRole("status", { name: "Category" })).toHaveTextContent("login");

    // Only for this query: an empty field searches under the filters again.
    await userEvent.clear(field());
    expect(scope()).toHaveTextContent("#finance");
  });
});

describe("MobileSearch keyboard behaviour", () => {
  const results = () => screen.getByRole("listbox", { hidden: true }).parentElement as HTMLElement;
  const drag = (el: HTMLElement, by: number) => {
    fireEvent.touchStart(el, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(el, { touches: [{ clientY: 300 - by }] });
  };

  it("dragging the results drops the keyboard; a tap's jitter doesn't", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    drag(results(), 4);
    expect(field()).toHaveFocus();
    drag(results(), 40);
    expect(field()).not.toHaveFocus();
  });

  it("back from a record restores how far the results were scrolled", async () => {
    const { unmount } = renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(field(), "i");
    results().scrollTop = 120;
    await userEvent.click(screen.getByRole("option", { name: /GitHub/ }));
    unmount();

    history.back();
    await waitFor(() => expect(location.pathname).toBe("/"));
    renderSearch();
    expect(results().scrollTop).toBe(120);
    expect(field()).toHaveFocus();
  });

  it("in landscape the results get the scope row's space, the row coming back for Search all items", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(max-height: 499px)",
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.queryByRole("list", { name: "Search scope" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Filter finance", hidden: true }));
    expect(screen.getByRole("button", { name: "Search all items" })).toBeInTheDocument();
  });
});
