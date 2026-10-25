import { ShortcutProvider } from "@repo/client";
import { PreferencesProvider } from "@repo/client/src/providers/PreferencesProvider";
import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { usePreferencesStore } from "@/hooks/use-preferences-store";
import { CategorySidebar } from "./CategorySidebar";
import RecordList from "./RecordList";

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

function renderSidebar() {
  render(
    <Providers>
      <CategorySidebar />
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

beforeEach(() => localStorage.clear());

describe("CategorySidebar", () => {
  it("lists All items, Favorites and every record type with its count", () => {
    renderSidebar();
    expect(
      within(sidebar())
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "All items (3)",
      "Favorites (1)",
      "Logins (2)",
      "Credit cards (1)",
      "Identities (0)",
      "Secure notes (0)",
      "SSH keys (0)",
      "API keys (0)",
      "Wi-Fi networks (0)",
    ]);
    expect(category("All items (3)")).toHaveAttribute("aria-pressed", "true");
  });

  it("narrows the list to the picked type", async () => {
    const user = renderSidebar();

    await user.click(category("Logins (2)"));

    expect(category("Logins (2)")).toHaveAttribute("aria-pressed", "true");
    expect(category("All items (3)")).toHaveAttribute("aria-pressed", "false");
    expect(listed()).toEqual(["GitHub", "Jira"]);
  });

  it("shows the starred records under Favorites", async () => {
    const user = renderSidebar();

    await user.click(category("Favorites (1)"));

    expect(listed()).toEqual(["GitHub"]);
  });

  it("dims an empty category but keeps it clickable", async () => {
    const user = renderSidebar();
    const empty = category("SSH keys (0)");
    expect(empty).toHaveClass("text-muted-foreground/70");
    expect(empty).toBeEnabled();

    await user.click(empty);

    expect(empty).toHaveAttribute("aria-pressed", "true");
    expect(listed()).toEqual([]);
  });
});

describe("RecordList header", () => {
  function renderList() {
    const location = memoryLocation({ path: "/records" });
    render(
      <Router hook={location.hook}>
        <ShortcutProvider>
          <Providers>
            <CategorySidebar />
            <TagPicks />
            <RecordList />
          </Providers>
        </ShortcutProvider>
      </Router>,
    );
    return userEvent.setup();
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

  const header = () => screen.getByRole("heading", { level: 2, name: /^(?!Categories)/ });

  it("titles the list with the category and its count, the tags below", async () => {
    const user = renderList();
    expect(header()).toHaveTextContent("All items3");
    expect(screen.queryByText(/^tagged/)).not.toBeInTheDocument();

    await user.click(category("Logins (2)"));
    await user.click(screen.getByRole("button", { name: "pick work" }));
    await user.click(screen.getByRole("button", { name: "pick infra" }));

    expect(header()).toHaveTextContent("Logins1");
    expect(screen.getByText(/^tagged/)).toHaveTextContent("tagged work and infra");
  });
});
