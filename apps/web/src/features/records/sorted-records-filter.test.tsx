import { PreferencesProvider } from "@repo/client/src/providers/PreferencesProvider";
import {
  listTitle,
  SortedRecordsProvider,
  useRecordSearch,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePreferencesStore } from "@/hooks/use-preferences-store";

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
  {
    ...makeRecord("work", { type: "login", title: "Jira", username: "me", tags: ["work"] }),
    vaultId: "v2",
  },
  makeRecord("login", { type: "login", title: "GitHub", username: "octo", tags: ["Work", "code"] }),
  makeRecord("card", { type: "card", title: "Visa", number: "4111111111111111", tags: ["bank"] }),
  makeRecord("wifi", { type: "wifi", title: "Home", ssid: "Park-Home" }),
);

vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records, ready: true, recordsNumber: records.length }),
}));

const vaultIds = vi.hoisted(() => ["v1", "v2"]);
vi.mock("@repo/client/src/hooks/use-vaults", () => ({
  useVaults: () => ({
    getVault: (vaultId: string) => (vaultIds.includes(vaultId) ? { vaultId } : undefined),
  }),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider store={usePreferencesStore()}>
      <SortedRecordsProvider>{children}</SortedRecordsProvider>
    </PreferencesProvider>
  );
}

// The vault filter is a stored preference.
beforeEach(() => localStorage.clear());

const ids = (list: DecryptedRecord[]) => list.map((record) => record.recordId).sort();

describe("type filter", () => {
  it("narrows the list to one type", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });
    expect(ids(result.current.sortedRecords)).toEqual(["card", "login", "wifi", "work"]);

    act(() => result.current.setTypeFilter("card"));
    expect(ids(result.current.sortedRecords)).toEqual(["card"]);
  });

  it("is ignored by a search, which looks through every record", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.setTypeFilter("card");
      result.current.setQuery("git");
    });
    expect(ids(result.current.sortedRecords)).toEqual(["login"]);
  });

  it("applies to useRecordSearch's browsing, not its search", () => {
    const { result, rerender } = renderHook(
      ({ query }) => useRecordSearch(query, { type: "wifi" }).flatMap((group) => group.records),
      { wrapper: Providers, initialProps: { query: "" } },
    );
    expect(ids(result.current)).toEqual(["wifi"]);

    rerender({ query: "visa" });
    expect(ids(result.current)).toEqual(["card"]);
  });
});

describe("vault filter", () => {
  it("narrows the list to one vault, and combines with the type filter", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.setVaultFilter("v2"));
    expect(ids(result.current.sortedRecords)).toEqual(["work"]);

    act(() => {
      result.current.setVaultFilter("v1");
      result.current.setTypeFilter("login");
    });
    expect(ids(result.current.sortedRecords)).toEqual(["login"]);
  });

  it("is ignored by a search, which looks through every vault", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.setVaultFilter("v1");
      result.current.setQuery("jira");
    });
    expect(ids(result.current.sortedRecords)).toEqual(["work"]);
  });

  it("reads a vault this profile doesn't have (another profile's, or deleted) as all vaults", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.setVaultFilter("v-gone"));
    expect(result.current.vaultFilter).toBe("all");
    expect(ids(result.current.sortedRecords)).toEqual(["card", "login", "wifi", "work"]);
  });

  it("applies to useRecordSearch's browsing", () => {
    const { result } = renderHook(
      () => useRecordSearch("", { vault: "v2" }).flatMap((group) => group.records),
      { wrapper: Providers },
    );
    expect(ids(result.current)).toEqual(["work"]);
  });
});

describe("tag filter", () => {
  it("narrows the list to the records carrying the tag, matched without case", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.setTagFilter("WORK"));
    expect(ids(result.current.sortedRecords)).toEqual(["login", "work"]);
  });

  it("combines with the vault and type filters", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.setVaultFilter("v1");
      result.current.setTagFilter("work");
    });
    expect(ids(result.current.sortedRecords)).toEqual(["login"]);

    act(() => result.current.setTypeFilter("card"));
    expect(ids(result.current.sortedRecords)).toEqual([]);
  });

  it("offers the tags of the vault in view, with counts", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });
    expect(result.current.tags.map(({ tag, count }) => `${tag}:${count}`)).toEqual([
      "bank:1",
      "code:1",
      // One "Work" and one "work": a tie keeps the first spelling seen.
      "work:2",
    ]);

    act(() => result.current.setVaultFilter("v2"));
    expect(result.current.tags).toEqual([{ tag: "work", count: 1 }]);
  });

  it("reads a tag no record in view carries as every record", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.setVaultFilter("v2");
      result.current.setTagFilter("bank");
    });
    expect(result.current.tagFilter).toBeNull();
    expect(ids(result.current.sortedRecords)).toEqual(["work"]);
  });

  it("is ignored by a search", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.setTagFilter("bank");
      result.current.setQuery("jira");
    });
    expect(ids(result.current.sortedRecords)).toEqual(["work"]);
  });

  it("applies to useRecordSearch's browsing", () => {
    const { result } = renderHook(
      () => useRecordSearch("", { tag: "code" }).flatMap((group) => group.records),
      { wrapper: Providers },
    );
    expect(ids(result.current)).toEqual(["login"]);
  });
});

describe("search", () => {
  it("finds records by tag too", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.setQuery("ban"));
    expect(ids(result.current.sortedRecords)).toEqual(["card"]);
  });
});

describe("listTitle", () => {
  const vault = { vaultId: "v1", name: "Family", kind: "shared", role: "owner" } as const;

  it("names the vault, the type and the tag the list is narrowed to", () => {
    expect(listTitle({ typeFilter: "all", tagFilter: null, searching: false })).toBe("All items");
    expect(listTitle({ typeFilter: "login", tagFilter: "work", searching: false, vault })).toBe(
      "Family · Logins · #work",
    );
    expect(listTitle({ typeFilter: "all", tagFilter: "work", searching: false })).toBe("#work");
    expect(listTitle({ typeFilter: "all", tagFilter: "work", searching: true })).toBe("Results");
  });
});
