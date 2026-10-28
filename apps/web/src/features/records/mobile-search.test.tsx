import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import { holdKeyboard } from "@repo/ui/lib/keyboard-handoff";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordPaths } from "@/app/route-paths";
import { fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";
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
  const { tagFilters, categoryFilter, setCategoryFilter } = useSortedRecords();
  return (
    <>
      <output aria-label="Tag filters">{tagFilters.join(",")}</output>
      <output aria-label="Category">{categoryFilter}</output>
      <button type="button" onClick={() => setCategoryFilter("login")}>
        Show logins
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
    await userEvent.click(screen.getByRole("button", { name: "finance (1)" }));
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

describe("MobileSearch tag pills", () => {
  const pills = () =>
    within(screen.getByRole("toolbar", { name: "Filter by tag" }))
      .getAllByRole("button")
      .slice(1)
      .map((pill) => pill.textContent);

  it("ranks selected, then matching the text, then the rest; a pill toggles without blurring", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(pills()).toEqual(["#finance1", "#work1"]);

    await userEvent.type(field(), "wo");
    expect(pills()).toEqual(["#work1", "#finance1"]);

    await userEvent.click(screen.getByRole("button", { name: "finance (1)" }));
    expect(screen.getByRole("status", { name: "Tag filters" })).toHaveTextContent("finance");
    expect(field()).toHaveValue("wo");
    expect(field()).toHaveFocus();
    expect(screen.getByRole("button", { name: "Remove tag finance" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(pills()[0]).toBe("#finance");

    // "wo" finds nothing under #finance, so it isn't kept as a recent search.
    await userEvent.clear(field());
    expect(screen.queryByRole("region", { name: "Recent searches" })).toBeNull();
  });

  it("a pill matching the typed text replaces it", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(field(), "fin");
    await userEvent.click(screen.getByRole("button", { name: "finance (1)" }));

    expect(screen.getByRole("status", { name: "Tag filters" })).toHaveTextContent("finance");
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
  });

  it("All tags switches to # tag mode, where the bar gives way to the list", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("button", { name: "All tags" }));

    expect(field()).toHaveValue("#");
    expect(field()).toHaveFocus();
    expect(screen.queryByRole("toolbar", { name: "Filter by tag" })).toBeNull();
  });

  it("rides on the keyboard: the inset follows the visual viewport, not a pinch-zoom", async () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 844);
    try {
      renderSearch();
      await userEvent.click(screen.getByRole("button", { name: "Search" }));

      viewport.height = 541;
      viewport.dispatchEvent(new Event("resize"));
      await waitFor(() => expect(dialog()?.style.getPropertyValue("--kb-inset")).toBe("303px"));

      viewport.height = 844;
      viewport.dispatchEvent(new Event("resize"));
      await waitFor(() => expect(dialog()?.style.getPropertyValue("--kb-inset")).toBe("0px"));

      Object.assign(viewport, { height: 422, scale: 2 });
      viewport.dispatchEvent(new Event("resize"));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(dialog()?.style.getPropertyValue("--kb-inset")).toBe("0px");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("MobileSearch focus and filters", () => {
  it("Clear all drops the tags and the category, keeping the field focused; Cancel brings them back", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Show logins" }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("button", { name: "finance (1)" }));

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("status", { name: "Tag filters" })).toHaveTextContent("");
    expect(screen.getByRole("status", { name: "Category" })).toHaveTextContent("all");
    expect(field()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog()).toHaveAttribute("aria-hidden", "true"));
    expect(screen.getByRole("status", { name: "Category" })).toHaveTextContent("login");
  });

  it("a tap that loses the field anyway (iOS) focuses it again", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    const pill = screen.getByRole("button", { name: "work (1)" });

    fireEvent.pointerDown(pill);
    field().blur();
    fireEvent.click(pill);
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

  it("Clear all isn't offered while Search all items runs past the filters", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("button", { name: "work (1)" }));
    await userEvent.type(field(), "fin");
    expect(screen.getByRole("button", { name: "Clear all" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Search all items/ }));
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });
});

describe("MobileSearch tag tokens and tag mode", () => {
  const filters = () => screen.getByRole("status", { name: "Tag filters" });

  it("picked tags sit in the field: ✕ or Backspace on an empty field removes one", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("button", { name: "finance (1)" }));

    expect(field()).toHaveAttribute("placeholder", "Search in tag");
    expect(screen.getByRole("group", { name: "Tagged #finance" })).toHaveTextContent("Fineco");

    await userEvent.click(screen.getByRole("button", { name: "Remove finance from search" }));
    expect(filters()).toHaveTextContent("");
    expect(field()).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "work (1)" }));
    await userEvent.type(field(), "g{Backspace}");
    fireEvent.keyDown(field(), { key: "Backspace", repeat: true });
    expect(filters()).toHaveTextContent("work");
    await userEvent.type(field(), "{Backspace}");
    expect(filters()).toHaveTextContent("");
    expect(field()).toHaveAttribute("placeholder", "Search logins, notes, #tags");
  });

  it("# lists the tags to tick; Show N items goes back to the records under them", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(field(), "#fin");

    const bar = () => screen.getByRole("toolbar", { name: "Picked tags" });
    expect(bar()).toHaveTextContent("0 tags · 2 items");
    await userEvent.click(screen.getByRole("option", { name: /^finance/ }));
    expect(filters()).toHaveTextContent("finance");
    expect(screen.getByRole("option", { name: /^finance/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(field()).toHaveValue("#fin");
    expect(bar()).toHaveTextContent("1 tag · 1 item");

    await userEvent.click(within(bar()).getByRole("button", { name: "Show 1 item" }));
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
    expect(filters()).toHaveTextContent("finance");
    expect(screen.queryByRole("toolbar", { name: "Picked tags" })).toBeNull();
    expect(screen.getByRole("group", { name: "Tagged #finance" })).toHaveTextContent("Fineco");
  });

  it("in tag mode the done key shows the records, Clear drops the picked tags", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(field(), "#");
    await userEvent.click(screen.getByRole("option", { name: /^work/ }));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(filters()).toHaveTextContent("");

    await userEvent.click(screen.getByRole("option", { name: /^work/ }));
    await userEvent.type(field(), "{Enter}");
    expect(field()).toHaveValue("");
    expect(filters()).toHaveTextContent("work");
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
    expect(screen.getByRole("toolbar", { name: "Filter by tag" })).toBeInTheDocument();
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

  it("in landscape the results get the scope row's and the pills' space, the row coming back for Clear all", async () => {
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
    expect(screen.queryByRole("toolbar", { name: "Filter by tag" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Search scope" })).toBeNull();

    await userEvent.type(field(), "fin");
    await userEvent.click(screen.getByRole("option", { name: /^finance/ }));
    expect(screen.getByRole("button", { name: "Clear all" })).toBeInTheDocument();
  });
});
