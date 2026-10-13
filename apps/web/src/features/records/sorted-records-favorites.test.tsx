import { PreferencesProvider } from "@repo/client/src/providers/PreferencesProvider";
import {
  FAVORITES_LABEL,
  SortedRecordsProvider,
  useRecordSearch,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreferencesStore } from "@/hooks/use-preferences-store";

function makeRecord(
  id: string,
  data: RecordData,
  clientUpdatedAt = "2026-10-01T10:00:00.000Z",
): DecryptedRecord {
  return {
    ...data,
    schemaVersion: 1,
    recordId: id,
    vaultId: "v1",
    version: 1,
    clientUpdatedAt,
    created_at: null,
    firstCreatedAt: null,
  } as DecryptedRecord;
}

const records = vi.hoisted(() => [] as DecryptedRecord[]);
records.push(
  makeRecord("bank", { type: "login", title: "Bank", favorite: true }, "2026-10-01T08:00:00.000Z"),
  makeRecord("zoo", { type: "wifi", title: "Zoo", ssid: "zoo", favorite: true }),
  makeRecord("amazon", { type: "login", title: "Amazon" }, "2026-10-01T11:00:00.000Z"),
  makeRecord("digits", { type: "login", title: "1Password" }),
  { ...makeRecord("jira", { type: "login", title: "Jira", favorite: true }), vaultId: "v2" },
);

vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records, ready: true, recordsNumber: records.length }),
}));

vi.mock("@repo/client/src/hooks/use-vaults", () => ({
  useVaults: () => ({
    getVault: (vaultId: string) => (["v1", "v2"].includes(vaultId) ? { vaultId } : undefined),
  }),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider store={usePreferencesStore()}>
      <SortedRecordsProvider>{children}</SortedRecordsProvider>
    </PreferencesProvider>
  );
}

type Group = { label: string | null; records: DecryptedRecord[] };
const shape = (groups: Group[]) =>
  groups.map((group) => [group.label, group.records.map((record) => record.recordId)]);

beforeEach(() => {
  localStorage.clear();
  // "Today" for the date buckets of the most-recent sort.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("favorites group", () => {
  it("leads the most-recent list, its records out of their date group", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    expect(shape(result.current.recordGroups)).toEqual([
      // Ties break by title.
      [FAVORITES_LABEL, ["jira", "zoo", "bank"]],
      ["Today", ["amazon", "digits"]],
    ]);
  });

  it("leads the A–Z list in A–Z order, and labels the non-letter group under it", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.handleSortChange("alphabetical"));
    expect(shape(result.current.recordGroups)).toEqual([
      [FAVORITES_LABEL, ["bank", "jira", "zoo"]],
      ["#", ["digits"]],
      ["A", ["amazon"]],
    ]);
  });

  it("orders sortedRecords as shown, favorites first", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.handleSortChange("alphabetical"));
    expect(result.current.sortedRecords.map((record) => record.recordId)).toEqual([
      "bank",
      "jira",
      "zoo",
      "digits",
      "amazon",
    ]);
  });

  it("follows the type and vault filters, and is gone when none is left", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.setTypeFilter("wifi"));
    expect(shape(result.current.recordGroups)).toEqual([[FAVORITES_LABEL, ["zoo"]]]);

    act(() => {
      result.current.setTypeFilter("all");
      result.current.setVaultFilter("v2");
    });
    expect(shape(result.current.recordGroups)).toEqual([[FAVORITES_LABEL, ["jira"]]]);

    act(() => result.current.setTypeFilter("wifi"));
    expect(result.current.recordGroups).toEqual([]);
  });

  it("is not part of a search, which stays one flat list", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });

    act(() => result.current.setQuery("a"));
    expect(shape(result.current.recordGroups)).toEqual([
      [null, ["bank", "amazon", "digits", "jira"]],
    ]);
  });

  it("leads useRecordSearch's browsing too, but not its search", () => {
    const { result, rerender } = renderHook(({ query }) => useRecordSearch(query), {
      wrapper: Providers,
      initialProps: { query: "" },
    });
    expect(result.current[0]?.label).toBe(FAVORITES_LABEL);

    rerender({ query: "zoo" });
    expect(shape(result.current)).toEqual([[null, ["zoo"]]]);
  });
});
