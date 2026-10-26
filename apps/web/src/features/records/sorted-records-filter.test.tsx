import { PreferencesProvider } from "@repo/client/src/providers/PreferencesProvider";
import {
  listHeading,
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

describe("category filter", () => {
  it("narrows the list to one type", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });
    expect(ids(result.current.sortedRecords)).toEqual(["card", "login", "wifi", "work"]);

    act(() => result.current.setCategoryFilter("card"));
    expect(ids(result.current.sortedRecords)).toEqual(["card"]);
  });

  it("scopes a search, counting the matches it hides until widened", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.setCategoryFilter("card");
      result.current.setQuery("git");
    });
    expect(ids(result.current.sortedRecords)).toEqual([]);
    expect(ids(result.current.outsideScope)).toEqual(["login"]);

    act(() => result.current.searchAllItems());
    expect(ids(result.current.sortedRecords)).toEqual(["login"]);
    expect(result.current.outsideScope).toEqual([]);
    expect(result.current.categoryFilter).toBe("card");

    act(() => result.current.setQuery(""));
    expect(result.current.searchAll).toBe(false);
  });

  it("ends Search all items once the filters change", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.setCategoryFilter("card");
      result.current.setQuery("git");
    });
    act(() => result.current.searchAllItems());
    act(() => result.current.setCategoryFilter("wifi"));
    expect(result.current.searchAll).toBe(false);
    expect(ids(result.current.outsideScope)).toEqual(["login"]);
  });

  it("applies to useRecordSearch's browsing and search", () => {
    const { result, rerender } = renderHook(
      ({ query }) => useRecordSearch(query, { category: "wifi" }).flatMap((group) => group.records),
      { wrapper: Providers, initialProps: { query: "" } },
    );
    expect(ids(result.current)).toEqual(["wifi"]);

    rerender({ query: "visa" });
    expect(ids(result.current)).toEqual([]);
    rerender({ query: "home" });
    expect(ids(result.current)).toEqual(["wifi"]);
  });
});

describe("vault filter", () => {
  it("narrows the list to one vault, and combines with the type filter", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.setVaultFilter("v2"));
    expect(ids(result.current.sortedRecords)).toEqual(["work"]);

    act(() => {
      result.current.setVaultFilter("v1");
      result.current.setCategoryFilter("login");
    });
    expect(ids(result.current.sortedRecords)).toEqual(["login"]);
  });

  it("scopes a search to the vault in view", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.setVaultFilter("v1");
      result.current.setQuery("jira");
    });
    expect(ids(result.current.sortedRecords)).toEqual([]);

    act(() => result.current.setVaultFilter("all"));
    expect(ids(result.current.sortedRecords)).toEqual(["work"]);
  });

  it("resets the category on a switch", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.setCategoryFilter("card"));
    act(() => result.current.setVaultFilter("v2"));
    expect(result.current.categoryFilter).toBe("all");
    expect(ids(result.current.sortedRecords)).toEqual(["work"]);
  });

  it("scopes useRecordSearch's search too", () => {
    const { result } = renderHook(
      () => useRecordSearch("jira", { vault: "v1" }).flatMap((group) => group.records),
      { wrapper: Providers },
    );
    expect(ids(result.current)).toEqual([]);
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

describe("tag filters", () => {
  it("narrows the list to the records carrying the tag, matched without case", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.toggleTag("WORK"));
    expect(ids(result.current.sortedRecords)).toEqual(["login", "work"]);
    expect(result.current.tagFilters).toEqual(["work"]);
  });

  it("keeps the records carrying every selected tag, in the order picked", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.toggleTag("code"));
    act(() => result.current.toggleTag("work"));
    expect(result.current.tagFilters).toEqual(["code", "work"]);
    expect(ids(result.current.sortedRecords)).toEqual(["login"]);

    act(() => result.current.toggleTag("CODE"));
    expect(result.current.tagFilters).toEqual(["work"]);
    expect(ids(result.current.sortedRecords)).toEqual(["login", "work"]);

    act(() => result.current.removeTag("work"));
    expect(result.current.tagFilters).toEqual([]);

    act(() => {
      result.current.toggleTag("work");
      result.current.toggleTag("bank");
    });
    expect(ids(result.current.sortedRecords)).toEqual([]);
    act(() => result.current.clearTags());
    expect(ids(result.current.sortedRecords)).toEqual(["card", "login", "wifi", "work"]);
  });

  it("combines with the vault and category filters", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.setVaultFilter("v1");
      result.current.toggleTag("work");
    });
    expect(ids(result.current.sortedRecords)).toEqual(["login"]);

    act(() => result.current.setCategoryFilter("card"));
    expect(ids(result.current.sortedRecords)).toEqual([]);
  });

  it("offers the tags of the vault in view, selected first, counted against the filters", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });
    const shown = () => result.current.tags.map(({ tag, count }) => `${tag}:${count}`);
    // One "Work" and one "work": a tie keeps the first spelling seen.
    expect(shown()).toEqual(["bank:1", "code:1", "work:2"]);

    act(() => result.current.toggleTag("work"));
    expect(shown()).toEqual(["work:2", "bank:0", "code:1"]);

    act(() => result.current.setCategoryFilter("card"));
    expect(shown()).toEqual(["work:0", "bank:0", "code:0"]);

    act(() => result.current.setVaultFilter("v2"));
    expect(shown()).toEqual(["work:1"]);
  });

  it("drops a selected tag no record of the vault in view carries", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.toggleTag("bank");
      result.current.toggleTag("work");
    });
    act(() => result.current.setVaultFilter("v2"));
    expect(result.current.tagFilters).toEqual(["work"]);
    expect(ids(result.current.sortedRecords)).toEqual(["work"]);

    act(() => result.current.setVaultFilter("all"));
    expect(result.current.tagFilters).toEqual(["work"]);
  });

  it("scopes a search", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.toggleTag("work");
      result.current.setQuery("o");
    });
    expect(ids(result.current.sortedRecords)).toEqual(["login", "work"]);
    expect(ids(result.current.outsideScope)).toEqual(["wifi"]);
    expect(result.current.recordMatches.map(({ field }) => field)).toEqual(["subtitle", "tag"]);
  });

  it("showTag selects only that tag, every other filter cleared", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.setVaultFilter("v2");
      result.current.toggleTag("work");
      result.current.setCategoryFilter("wifi");
      result.current.setQuery("x");
    });
    act(() => result.current.showTag("bank"));
    expect(result.current).toMatchObject({
      query: "",
      vaultFilter: "all",
      categoryFilter: "all",
      tagFilters: ["bank"],
    });
    expect(ids(result.current.sortedRecords)).toEqual(["card"]);
  });

  it("clearFilters drops the category and every tag, keeping the vault", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => {
      result.current.setVaultFilter("v1");
      result.current.setCategoryFilter("login");
      result.current.toggleTag("code");
    });
    act(() => result.current.clearFilters());
    expect(result.current).toMatchObject({
      vaultFilter: "v1",
      categoryFilter: "all",
      tagFilters: [],
    });
    expect(ids(result.current.sortedRecords)).toEqual(["card", "login", "wifi"]);
  });

  it("applies to useRecordSearch's browsing", () => {
    const { result } = renderHook(
      () => useRecordSearch("", { tags: ["code"] }).flatMap((group) => group.records),
      { wrapper: Providers },
    );
    expect(ids(result.current)).toEqual(["login"]);
  });
});

describe("category counts", () => {
  it("counts each category for the vault and tags in view", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });
    expect(result.current.categoryCounts).toMatchObject({
      all: 4,
      favorites: 0,
      login: 2,
      card: 1,
      wifi: 1,
      note: 0,
    });

    act(() => result.current.setCategoryFilter("card"));
    act(() => result.current.toggleTag("work"));
    expect(result.current.categoryCounts).toMatchObject({ all: 2, login: 2, card: 0 });

    act(() => result.current.setVaultFilter("v2"));
    expect(result.current.categoryCounts).toMatchObject({ all: 1, login: 1 });
  });
});

describe("search", () => {
  it("finds records by tag too", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.setQuery("ban"));
    expect(ids(result.current.sortedRecords)).toEqual(["card"]);
  });

  it("matches only tags after a #", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.setQuery("#o"));
    expect(ids(result.current.sortedRecords)).toEqual(["login", "work"]);

    act(() => result.current.setQuery("#"));
    expect(ids(result.current.sortedRecords)).toEqual(["card", "login", "work"]);
  });
});

describe("listTitle", () => {
  const vault = { vaultId: "v1", name: "Family", kind: "shared", role: "owner" } as const;

  it("names the vault, the category and the tags the list is narrowed to", () => {
    expect(listTitle({ categoryFilter: "all", tagFilters: [], searching: false })).toBe(
      "All items",
    );
    expect(
      listTitle({ categoryFilter: "login", tagFilters: ["work", "code"], searching: false, vault }),
    ).toBe("Family · Logins · #work #code");
    expect(listTitle({ categoryFilter: "favorites", tagFilters: [], searching: false })).toBe(
      "Favorites",
    );
    expect(listTitle({ categoryFilter: "all", tagFilters: ["work"], searching: true })).toBe(
      "Results",
    );
  });
});

describe("listHeading", () => {
  it("names the category, or the search", () => {
    expect(listHeading("all", false)).toBe("All items");
    expect(listHeading("ssh_key", false)).toBe("SSH keys");
    expect(listHeading("favorites", true)).toBe("Results");
  });
});
