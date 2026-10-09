import { PreferencesProvider } from "@repo/client/src/providers/PreferencesProvider";
import {
  SortedRecordsProvider,
  useRecordSearch,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
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
  makeRecord("login", { type: "login", title: "GitHub", username: "octo" }),
  makeRecord("card", { type: "card", title: "Visa", number: "4111111111111111" }),
  makeRecord("wifi", { type: "wifi", title: "Home", ssid: "Park-Home" }),
);

vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records, ready: true, recordsNumber: records.length }),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider store={usePreferencesStore()}>
      <SortedRecordsProvider>{children}</SortedRecordsProvider>
    </PreferencesProvider>
  );
}

const ids = (list: DecryptedRecord[]) => list.map((record) => record.recordId).sort();

describe("type filter", () => {
  it("narrows the list to one type", () => {
    const { result } = renderHook(() => useSortedRecords(), { wrapper: Providers });
    expect(ids(result.current.sortedRecords)).toEqual(["card", "login", "wifi"]);

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
