import { PreferencesProvider } from "@repo/client/src/providers/PreferencesProvider";
import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreferencesStore } from "@/hooks/use-preferences-store";

function makeRecord(
  id: string,
  vaultId: string,
  data: RecordData,
  clientUpdatedAt = "2026-10-01T10:00:00.000Z",
): DecryptedRecord {
  return {
    ...data,
    schemaVersion: 1,
    recordId: id,
    vaultId,
    version: 1,
    clientUpdatedAt,
    created_at: null,
    firstCreatedAt: null,
  } as DecryptedRecord;
}

const records = vi.hoisted(() => [] as DecryptedRecord[]);
records.push(
  makeRecord("netflix", "family", { type: "login", title: "Netflix" }, "2026-10-01T11:00:00.000Z"),
  makeRecord("n26", "personal", { type: "login", title: "N26" }, "2026-10-01T09:00:00.000Z"),
  makeRecord("github", "work", { type: "login", title: "GitHub", favorite: true }),
  makeRecord("hetzner", "work", { type: "login", title: "Hetzner" }, "2026-10-01T11:30:00.000Z"),
  makeRecord("amazon", "personal", { type: "login", title: "Amazon" }, "2026-10-01T10:30:00.000Z"),
);

const vaults = vi.hoisted(() => ({
  list: [] as { vaultId: string; name: string }[],
}));
const ALL_VAULTS = [
  { vaultId: "personal", name: "Personal" },
  { vaultId: "work", name: "Work" },
  { vaultId: "family", name: "Family" },
];

vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records, ready: true, recordsNumber: records.length }),
}));

vi.mock("@repo/client/src/hooks/use-vaults", () => ({
  useVaults: () => ({
    vaults: vaults.list,
    getVault: (vaultId: string) => vaults.list.find((vault) => vault.vaultId === vaultId),
    hasSeveralVaults: vaults.list.length > 1,
  }),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider store={usePreferencesStore()}>
      <SortedRecordsProvider>{children}</SortedRecordsProvider>
    </PreferencesProvider>
  );
}

type Group = { label: string | null; records: DecryptedRecord[]; folded?: boolean };
const shape = (groups: Group[]) =>
  groups.map((group) => [group.label, group.records.map((record) => record.recordId)]);
const ids = (list: DecryptedRecord[]) => list.map((record) => record.recordId);

function renderSorted() {
  return renderHook(() => useSortedRecords(), { wrapper: Providers });
}

beforeEach(() => {
  localStorage.clear();
  vaults.list = ALL_VAULTS;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("vault badges", () => {
  it("show in All vaults with several vaults", () => {
    const { result } = renderSorted();
    expect(result.current.showVaultBadges).toBe(true);
  });

  it("hide with one vault in view", () => {
    const { result } = renderSorted();
    act(() => result.current.setVaultFilter("work"));
    expect(result.current.showVaultBadges).toBe(false);
    expect(result.current.canGroupByVault).toBe(false);
  });

  it("hide when the profile has a single vault", () => {
    vaults.list = ALL_VAULTS.slice(0, 1);
    const { result } = renderSorted();
    expect(result.current.showVaultBadges).toBe(false);
  });

  it("hide while grouped by vault, and come back for a search", () => {
    const { result } = renderSorted();
    act(() => result.current.setGroupByVault(true));
    expect(result.current.showVaultBadges).toBe(false);

    act(() => result.current.setQuery("n"));
    expect(result.current.showVaultBadges).toBe(true);
  });
});

describe("By vault", () => {
  it("groups by vault in the vaults' order, the sort inside, starred first", () => {
    const { result } = renderSorted();
    act(() => result.current.setGroupByVault(true));

    expect(shape(result.current.recordGroups)).toEqual([
      ["Personal", ["amazon", "n26"]],
      ["Work", ["github", "hetzner"]],
      ["Family", ["netflix"]],
    ]);
    expect(result.current.hasGroupLabels).toBe(true);
    expect(ids(result.current.sortedRecords)).toEqual([
      "amazon",
      "n26",
      "github",
      "hetzner",
      "netflix",
    ]);
  });

  it("keeps A–Z inside each group", () => {
    const { result } = renderSorted();
    act(() => {
      result.current.setGroupByVault(true);
      result.current.handleSortChange("alphabetical");
    });

    expect(shape(result.current.recordGroups)[0]).toEqual(["Personal", ["amazon", "n26"]]);
  });

  it("folds a vault: its records stay counted but leave the list's order", () => {
    const { result } = renderSorted();
    act(() => result.current.setGroupByVault(true));
    act(() => result.current.toggleVaultFold("work"));

    const work = result.current.recordGroups.find((group) => group.vault?.vaultId === "work");
    expect(work?.folded).toBe(true);
    expect(work?.records).toHaveLength(2);
    expect(ids(result.current.sortedRecords)).toEqual(["amazon", "n26", "netflix"]);

    act(() => result.current.toggleVaultFold("work"));
    expect(ids(result.current.sortedRecords)).toHaveLength(5);
  });

  it("does nothing with one vault in view", () => {
    const { result } = renderSorted();
    act(() => {
      result.current.setGroupByVault(true);
      result.current.setVaultFilter("work");
    });

    expect(result.current.recordGroups.some((group) => group.vault)).toBe(false);
  });
});
