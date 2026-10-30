import { PREF_KEYS, ShortcutProvider } from "@repo/client";
import { PreferencesProvider } from "@repo/client/src/providers/PreferencesProvider";
import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { usePreferencesStore } from "@/hooks/use-preferences-store";
import { CategorySidebar, SidebarTagsRow } from "./CategorySidebar";
import RecordList from "./RecordList";
import RecordsEmptyState from "./RecordsEmptyState";
import { SidebarHeader, SidebarToggle } from "./SidebarHeader";
import { PREVIEW_DELAY_MS } from "./use-search-panel";
import { useSidebarCollapsed } from "./use-sidebar-collapsed";

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
  makeRecord("github", {
    type: "login",
    title: "GitHub",
    username: "octo",
    favorite: true,
    tags: ["work", "infra"],
  }),
  makeRecord("jira", { type: "login", title: "Jira", username: "me", tags: ["work"] }),
  makeRecord("visa", { type: "card", title: "Visa", number: "4111111111111111" }),
);

vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records, ready: true, recordsNumber: records.length }),
}));

vi.mock("@repo/client/src/hooks/use-vaults", () => ({
  useVaults: () => ({ getVault: () => undefined }),
}));

vi.mock("@/features/vaults", async (importActual) => ({
  ...(await importActual<object>()),
  VaultSwitcher: () => null,
}));

vi.mock("@/features/import", () => ({
  ImportDialog: ({ children }: { children: ReactNode }) => children,
}));

// jsdom has no `CSS.supports`; the scroll effects are out of scope here.
vi.mock("@repo/ui/hooks/use-sticky-label-fade", () => ({ useStickyLabelFade: () => {} }));
vi.mock("@repo/ui/hooks/use-scroll-collapse", () => ({ useScrollCollapse: () => {} }));

function Titles() {
  const { sortedRecords } = useSortedRecords();
  return (
    <ul aria-label="Records">
      {sortedRecords.map((record) => (
        <li key={record.recordId}>{record.title}</li>
      ))}
    </ul>
  );
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider store={usePreferencesStore()}>
      <SortedRecordsProvider>{children}</SortedRecordsProvider>
    </PreferencesProvider>
  );
}

function Sidebar() {
  const [collapsed, setCollapsed, toggleRef] = useSidebarCollapsed();
  return (
    <div id="sidebar">
      <SidebarHeader
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        controlsId="sidebar"
        toggleRef={toggleRef}
      />
      <CategorySidebar collapsed={collapsed} />
      <SidebarTagsRow collapsed={collapsed} />
      {collapsed && setCollapsed && (
        <SidebarToggle
          ref={toggleRef}
          collapsed
          onCollapsedChange={setCollapsed}
          controlsId="sidebar"
        />
      )}
    </div>
  );
}

function setWindowWide(wide: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: wide && query === "(min-width: 75rem)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function renderSidebar() {
  render(
    <Providers>
      <Sidebar />
      <Titles />
    </Providers>,
  );
  return userEvent.setup();
}

const sidebar = () => screen.getByRole("navigation", { name: "Categories" });
const category = (name: string) => within(sidebar()).getByRole("button", { name });
const listed = () =>
  within(screen.getByRole("list", { name: "Records" }))
    .queryAllByRole("listitem")
    .map((item) => item.textContent)
    .sort();

beforeEach(() => {
  // jsdom doesn't lay out.
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  setWindowWide(true);
});

describe("CategorySidebar", () => {
  it("lists All items, Favorites and every record type with its count", () => {
    renderSidebar();
    expect(
      within(sidebar())
        .getAllByRole("button")
        .filter((button) => button.hasAttribute("aria-pressed"))
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "All items 3",
      "Favorites 1",
      "Logins 2",
      "Credit cards 1",
      "Identities 0",
      "Secure notes 0",
      "SSH keys 0",
      "API keys 0",
      "Wi-Fi networks 0",
    ]);
    expect(category("All items 3")).toHaveAttribute("aria-pressed", "true");
  });

  it("narrows the list to the picked type", async () => {
    const user = renderSidebar();

    await user.click(category("Logins 2"));

    expect(category("Logins 2")).toHaveAttribute("aria-pressed", "true");
    expect(category("All items 3")).toHaveAttribute("aria-pressed", "false");
    expect(listed()).toEqual(["GitHub", "Jira"]);
  });

  it("shows the starred records under Favorites", async () => {
    const user = renderSidebar();

    await user.click(category("Favorites 1"));

    expect(listed()).toEqual(["GitHub"]);
  });

  it("dims an empty category but keeps it clickable", async () => {
    const user = renderSidebar();
    const empty = category("SSH keys 0");
    expect(empty).toHaveClass("text-muted-foreground");
    expect(empty).toBeEnabled();

    await user.click(empty);

    expect(empty).toHaveAttribute("aria-pressed", "true");
    expect(listed()).toEqual([]);
  });
});

describe("CategorySidebar collapsed", () => {
  const toggle = () => screen.getByRole("button", { name: "Sidebar" });

  it("starts expanded on a wide window", () => {
    renderSidebar();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveAttribute("aria-controls", "sidebar");
    expect(within(sidebar()).getByText("Logins")).not.toHaveClass("sr-only");
  });

  it("stays a rail without a toggle on a narrow window, whatever was stored", () => {
    localStorage.setItem(PREF_KEYS.sidebarCollapsed, "false");
    setWindowWide(false);
    renderSidebar();
    expect(screen.queryByRole("button", { name: "Sidebar" })).toBeNull();
    expect(within(sidebar()).getByText("Logins")).toHaveClass("sr-only");
  });

  it("collapses to named icons and remembers the choice", async () => {
    const user = renderSidebar();

    await user.click(toggle());

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveFocus();
    expect(sidebar()).toHaveAccessibleName("Categories");
    expect(category("Logins 2")).toHaveAttribute("aria-pressed", "false");
    expect(within(sidebar()).getByText("Logins")).toHaveClass("sr-only");
    expect(localStorage.getItem(PREF_KEYS.sidebarCollapsed)).toBe("true");

    cleanup();
    renderSidebar();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    toggle().focus();
    await user.keyboard("{Enter}");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveFocus();
    expect(localStorage.getItem(PREF_KEYS.sidebarCollapsed)).toBe("false");
  });

  it("shows the name and count in a tooltip on focus", async () => {
    setWindowWide(false);
    const user = renderSidebar();

    await user.tab();
    expect(screen.getByRole("button", { name: "New record" })).toHaveFocus();
    await user.tab();

    expect(category("All items 3")).toHaveFocus();
    expect(await screen.findByText("All items 3")).toBeInTheDocument();
  });
});

function renderList() {
  const location = memoryLocation({ path: "/records", record: true });
  render(
    <Router hook={location.hook}>
      <ShortcutProvider>
        <Providers>
          <Sidebar />
          <TagPicks />
          <RecordList />
        </Providers>
      </ShortcutProvider>
    </Router>,
  );
  return { user: userEvent.setup(), location };
}

function TagPicks() {
  const { toggleTag } = useSortedRecords();
  return (
    <>
      <button type="button" onClick={() => toggleTag("work")}>
        pick work
      </button>
      <button type="button" onClick={() => toggleTag("infra")}>
        pick infra
      </button>
    </>
  );
}

const options = (listbox: string) =>
  within(screen.getByRole("listbox", { name: listbox }))
    .getAllByRole("option")
    .map((option) => option.textContent?.match(/GitHub|Jira|Visa|infra|work/)?.[0]);

describe("RecordList header", () => {
  const header = () => screen.getByRole("heading", { level: 2, name: /^(?!Categories)/ });

  it("titles the list with the category and its count, the filters as chips below", async () => {
    const { user } = renderList();
    expect(header()).toHaveTextContent("All items3");
    expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();

    await user.click(category("Logins 2"));
    await user.click(screen.getByRole("button", { name: "pick work" }));
    await user.click(screen.getByRole("button", { name: "pick infra" }));

    expect(header()).toHaveTextContent("Logins1");
    expect(
      within(screen.getByRole("list", { name: "Active filters" }))
        .getAllByRole("button")
        .map((chip) => chip.getAttribute("aria-label")),
    ).toEqual(["Remove filter Logins", "Remove tag work", "Remove tag infra"]);

    await user.click(screen.getByRole("button", { name: "Remove tag infra" }));
    expect(header()).toHaveTextContent("Logins2");

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();
    expect(header()).toHaveTextContent("All items3");
  });

  it("the sidebar's Tags row counts the tags, then the ones on, and opens the search in tag mode", async () => {
    const { user } = renderList();

    await user.click(screen.getByRole("button", { name: "Search tags (2)" }));
    const search = screen.getByRole("combobox", { name: "Search tags" });
    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
    expect(options("Tags")).toEqual(["infra", "work"]);

    await user.keyboard("{Enter}");
    expect(
      within(screen.getByRole("listbox", { name: "Tags" })).getByRole("option", { selected: true }),
    ).toHaveTextContent(/^infra/);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Search tags (1 on)" })).toHaveTextContent("1 on");
    expect(screen.getByRole("list", { name: "Active filters" })).toHaveTextContent("infra");
  });

  it("collapsed, the tag icon is tinted with a badge while tags are on", async () => {
    setWindowWide(false);
    const { user } = renderList();
    const tagIcon = () => screen.getByRole("button", { name: /^Search tags/ });
    expect(tagIcon()).toHaveAccessibleName("Search tags (2)");
    expect(tagIcon()).toHaveTextContent("Tags");
    expect(tagIcon()).not.toHaveClass("bg-primary/10");

    await user.click(screen.getByRole("button", { name: "pick work" }));

    expect(tagIcon()).toHaveAccessibleName("Search tags (1 on)");
    expect(tagIcon()).toHaveTextContent(/^Tags 1$/);
    expect(tagIcon()).toHaveClass("bg-primary/10");
  });
});

describe("search panel", () => {
  const field = () => screen.getByRole("combobox", { name: /^Search/ });

  it("replaces the list while focused: hint, top tags, then records and tags as you type", async () => {
    const { user } = renderList();
    await user.click(field());

    expect(screen.queryByRole("heading", { level: 2, name: /^(?!Categories)/ })).toBeNull();
    expect(screen.getByText("records and tags")).toBeInTheDocument();
    expect(options("Search results")).toEqual(["work", "infra"]);

    await user.keyboard("o");
    expect(options("Search results")).toEqual(["work", "GitHub", "Jira"]);
    expect(screen.getByRole("group", { name: "Records" })).toHaveTextContent("tagged #work");
  });

  it("↑↓ move, the highlighted record previews, ↵ opens it and closes the search", async () => {
    const { user, location } = renderList();
    await user.click(field());
    await user.keyboard("o");
    await waitFor(() => expect(location.history?.at(-1)).toBe("/record/github"));

    await user.keyboard("{ArrowDown}");
    expect(field()).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /Jira/ }).id,
    );
    await waitFor(() => expect(location.history?.at(-1)).toBe("/record/jira"));

    await user.keyboard("{Enter}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field()).toHaveValue("");
    expect(location.history?.at(-1)).toBe("/record/jira");
  });

  it("previews only once ↑↓ settle; hover highlights with the hint but previews nothing", async () => {
    const { user, location } = renderList();
    await user.click(field());
    await user.keyboard("o");
    await waitFor(() => expect(location.history?.at(-1)).toBe("/record/github"));

    const jira = screen.getByRole("option", { name: /Jira/ });
    await user.hover(jira);
    expect(field()).toHaveAttribute("aria-activedescendant", jira.id);
    expect(jira).toHaveTextContent(/Open$/);
    await new Promise((resolve) => setTimeout(resolve, PREVIEW_DELAY_MS + 50));
    expect(location.history?.at(-1)).toBe("/record/github");

    const work = screen.getByRole("option", { name: /^work/ });
    // A move: the pointer resting while the rows scroll under it highlights nothing.
    await user.pointer({ target: work, coords: { clientX: 0, clientY: 0 } });
    expect(work).not.toHaveTextContent(/Add filter$/);
    await user.pointer({ target: work, coords: { clientX: 20, clientY: 40 } });
    expect(work).toHaveTextContent(/Add filter$/);

    // From the hovered #work: GitHub, Jira, back, Jira again — only the last previews.
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}{ArrowDown}");
    expect(location.history?.at(-1)).toBe("/record/github");
    await waitFor(() => expect(location.history?.at(-1)).toBe("/record/jira"));
  });

  it("the ✕ next to esc closes the search", async () => {
    const { user } = renderList();
    await user.click(field());
    await user.keyboard("jir");

    await user.click(screen.getByRole("button", { name: "Close search" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field()).toHaveValue("");
  });

  it("brings the record it opened into view in the list", async () => {
    const { user } = renderList();
    await user.click(field());
    await user.keyboard("vis");
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    await user.click(screen.getByRole("option", { name: /Visa/ }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts.at(-1)).toBe(
      screen.getByRole("link", { name: /Visa/ }),
    );
  });

  it("tag mode's one pill shows its records, as Esc does", async () => {
    const { user } = renderList();
    await user.click(field());
    await user.keyboard("#inf{Enter}");
    expect(screen.getByRole("button", { name: "Show 1 record" })).toHaveTextContent(/^Show 1esc$/);
    expect(screen.queryByRole("button", { name: "Close search" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show 1 record" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("list", { name: "Active filters" })).toHaveTextContent("infra");
  });

  it("opening a record the filters hide drops them, so the list shows it", async () => {
    const { user, location } = renderList();
    await user.click(category("Credit cards 1"));
    await user.click(field());
    await user.keyboard("git{Control>}{Shift>}F{/Shift}{/Control}{Enter}");

    expect(location.history?.at(-1)).toBe("/record/github");
    expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();
    expect(screen.getByRole("link", { name: /GitHub/ })).toBeInTheDocument();
  });

  it("opening a record the filters keep leaves them", async () => {
    const { user } = renderList();
    await user.click(category("Logins 2"));
    await user.click(field());
    await user.keyboard("jir{Enter}");

    expect(screen.getByRole("list", { name: "Active filters" })).toHaveTextContent("Logins");
  });

  it("focusing alone keeps the open record; Esc brings it back after a preview", async () => {
    const { user, location } = renderList();
    await user.click(screen.getByRole("link", { name: /Visa/ }));
    expect(location.history?.at(-1)).toBe("/record/visa");

    await user.click(field());
    expect(location.history?.at(-1)).toBe("/record/visa");

    await user.keyboard("jir");
    await waitFor(() => expect(location.history?.at(-1)).toBe("/record/jira"));

    await user.keyboard("{Escape}");
    expect(location.history?.at(-1)).toBe("/record/visa");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("gives the list back on blur, the query still applied", async () => {
    const { user } = renderList();
    await user.click(field());
    await user.keyboard("jir");
    await user.click(screen.getByRole("button", { name: "pick infra" }));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: /Results/ })).toBeInTheDocument();
  });

  it("# switches to tag mode, Backspace on its empty token back to all", async () => {
    const { user } = renderList();
    await user.click(field());
    await user.keyboard("#");
    expect(screen.getByRole("combobox", { name: "Search tags" })).toHaveValue("");

    await user.keyboard("{Backspace}");
    expect(screen.getByRole("combobox", { name: "Search all vaults" })).toHaveValue("");
    expect(screen.getByRole("listbox", { name: "Search results" })).toBeInTheDocument();
  });

  it("keeps to the filters, counts what they hide and widens on Search all items", async () => {
    const { user } = renderList();
    await user.click(category("Credit cards 1"));
    await user.click(field());
    await user.keyboard("git");

    expect(screen.getByRole("list", { name: "Search scope" })).toHaveTextContent("Credit cards");
    expect(screen.getByText("1 more outside Credit cards")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^GitHub/ })).toBeNull();

    // The scope row's button ("Search all") and the count's ("Search all items"), both widening.
    expect(screen.getAllByRole("button", { name: /^Search all/ })).toHaveLength(2);
    await user.keyboard("{Control>}{Shift>}F{/Shift}{/Control}");
    expect(screen.getByRole("list", { name: "Search scope" })).toHaveTextContent("All items");
    expect(options("Search results")).toEqual(["GitHub"]);
    expect(screen.queryByRole("button", { name: /^Search all/ })).toBeNull();
    expect(field()).toHaveFocus();
  });
});

describe("filters", () => {
  it("open the list's first record when they leave the open one out, else the empty page", async () => {
    const { user, location } = renderList();
    await user.click(screen.getByRole("link", { name: /Jira/ }));

    await user.click(category("Credit cards 1"));
    expect(location.history?.at(-1)).toBe("/record/visa");

    await user.click(screen.getByRole("button", { name: "pick work" }));
    expect(location.history?.at(-1)).toBe("/");
  });

  it("the empty page says the filters left nothing, and clears them", async () => {
    const location = memoryLocation({ path: "/", record: true });
    render(
      <Router hook={location.hook}>
        <ShortcutProvider>
          <Providers>
            <Sidebar />
            <TagPicks />
            <RecordsEmptyState />
          </Providers>
        </ShortcutProvider>
      </Router>,
    );
    const user = userEvent.setup();
    expect(screen.getByText("Your vault is empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();

    await user.click(category("SSH keys 0"));
    expect(screen.getByText("No SSH keys yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New SSH key" })).toHaveAttribute(
      "href",
      expect.stringContaining("type=ssh_key"),
    );

    await user.click(category("Credit cards 1"));
    await user.click(screen.getByRole("button", { name: "pick work" }));
    expect(screen.getByText("Nothing matches these filters")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(category("All items 3")).toHaveAttribute("aria-pressed", "true");
  });

  it("keep a record they still list open", async () => {
    const { user, location } = renderList();
    await user.click(screen.getByRole("link", { name: /GitHub/ }));

    await user.click(screen.getByRole("button", { name: "pick work" }));
    expect(location.history?.at(-1)).toBe("/record/github");
  });
});

describe("list ↑↓", () => {
  it("move the highlight at once and open only the record they settle on", async () => {
    const { user, location } = renderList();
    await user.click(screen.getByRole("link", { name: /GitHub/ }));

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("link", { name: /Visa/ })).toHaveFocus();
    expect(location.history?.at(-1)).toBe("/record/github");

    await waitFor(() => expect(location.history?.at(-1)).toBe("/record/visa"));
    expect(location.history).not.toContain("/record/jira");
  });
});
