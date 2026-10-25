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
import { usePreferencesStore } from "@/hooks/use-preferences-store";
import { TagBar } from "./TagBar";

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
    tags: ["work", "code"],
  }),
  makeRecord("jira", { type: "login", title: "Jira", username: "me", tags: ["work"] }),
  makeRecord("visa", { type: "card", title: "Visa", number: "4111111111111111", tags: ["bank"] }),
);

vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records, ready: true, recordsNumber: records.length }),
}));

vi.mock("@repo/client/src/hooks/use-vaults", () => ({
  useVaults: () => ({ getVault: () => undefined }),
}));

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

function renderBar() {
  render(
    <Providers>
      <TagBar />
      <Titles />
    </Providers>,
  );
  return userEvent.setup();
}

const bar = () => screen.getByRole("group", { name: "Tags" });
const pillNames = () =>
  within(bar())
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label") ?? button.textContent);
const listed = () =>
  within(screen.getByRole("list", { name: "Records" }))
    .queryAllByRole("listitem")
    .map((item) => item.textContent)
    .sort();

beforeEach(() => localStorage.clear());

describe("TagBar", () => {
  it("lists every tag A–Z with its count", () => {
    renderBar();
    expect(pillNames()).toEqual(["bank (1)", "code (1)", "work (2)"]);
  });

  it("moves a picked tag to the start and narrows the list (AND)", async () => {
    const user = renderBar();

    await user.click(within(bar()).getByRole("button", { name: /work/ }));
    expect(pillNames()).toEqual(["Remove tag work", "Clear", "bank (0)", "code (1)"]);
    expect(listed()).toEqual(["GitHub", "Jira"]);

    await user.click(within(bar()).getByRole("button", { name: /code/ }));
    expect(pillNames().slice(0, 2)).toEqual(["Remove tag work", "Remove tag code"]);
    expect(listed()).toEqual(["GitHub"]);
  });

  it("dims and disables a tag that would empty the list", async () => {
    const user = renderBar();

    await user.click(within(bar()).getByRole("button", { name: /work/ }));
    expect(within(bar()).getByRole("button", { name: /bank/ })).toBeDisabled();
    expect(within(bar()).getByRole("button", { name: /code/ })).toBeEnabled();
  });

  it("removes one tag with its ×, all of them with Clear", async () => {
    const user = renderBar();

    await user.click(within(bar()).getByRole("button", { name: /work/ }));
    await user.click(within(bar()).getByRole("button", { name: /code/ }));
    await user.click(screen.getByRole("button", { name: "Remove tag work" }));
    expect(pillNames()[0]).toBe("Remove tag code");
    expect(listed()).toEqual(["GitHub"]);

    await user.click(within(bar()).getByRole("button", { name: /work/ }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("button", { name: /^Remove tag/ })).not.toBeInTheDocument();
    expect(listed()).toEqual(["GitHub", "Jira", "Visa"]);
  });

  it("finds and picks a tag in the All tags popover", async () => {
    const user = renderBar();

    await user.click(screen.getByRole("combobox", { name: "All 3 tags" }));
    await user.type(await screen.findByRole("combobox", { name: "Search tags" }), "co");
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["code1"]);

    await user.click(options[0]!);
    expect(screen.getByRole("button", { name: "Remove tag code" })).toBeInTheDocument();
    expect(listed()).toEqual(["GitHub"]);
  });
});

describe("TagBar without tags", () => {
  it("renders nothing", () => {
    const all = records.splice(0);
    try {
      render(
        <Providers>
          <TagBar />
        </Providers>,
      );
      expect(screen.queryByRole("group", { name: "Tags" })).not.toBeInTheDocument();
    } finally {
      records.push(...all);
    }
  });
});
