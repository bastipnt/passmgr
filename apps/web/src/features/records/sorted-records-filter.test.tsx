import { PreferencesProvider } from "@repo/client/src/providers/PreferencesProvider";
import {
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
  { ...makeRecord("work", { type: "login", title: "Jira", username: "me" }), vaultId: "v2" },
  makeRecord("login", { type: "login", title: "GitHub", username: "octo" }),
  makeRecord("card", { type: "card", title: "Visa", number: "4111111111111111" }),
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
      ({ query }) => useRecordSearch(query, "wifi").flatMap((group) => group.records),
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
      () => useRecordSearch("", "all", "v2").flatMap((group) => group.records),
      { wrapper: Providers },
    );
    expect(ids(result.current)).toEqual(["work"]);
  });
});
