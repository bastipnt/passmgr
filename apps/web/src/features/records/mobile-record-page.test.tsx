import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord } from "@repo/schema";
import { describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { recordPaths } from "@/app/route-paths";
import { renderWithProviders, screen } from "@/test/render";
import MobileRecordPage from "./MobileRecordPage";

const record = vi.hoisted(
  () =>
    ({
      type: "login",
      title: "GitHub",
      username: "octo",
      recordId: "github",
      vaultId: "v1",
      version: 1,
      schemaVersion: 1,
    }) as unknown as DecryptedRecord,
);

vi.mock("@repo/client/src/hooks/use-records", () => ({
  useGetRecords: () => ({ records: [record], ready: true, recordsNumber: 1 }),
}));
vi.mock("@repo/client/src/hooks/use-vaults", () => ({
  useVaults: () => ({ getVault: () => ({ vaultId: "v1" }), vaults: [], writableVaults: [] }),
}));
vi.mock("./use-record-actions", () => ({
  useRecordActions: () => ({ record, ready: true, deleteRecord: vi.fn() }),
  useRecordShortcuts: () => {},
}));
vi.mock("./Record", () => ({ default: () => null }));
vi.mock("@repo/ui/hooks/use-scroll-collapse", () => ({ useScrollCollapse: () => {} }));
vi.mock("./RecordActions", () => ({ FavoriteButton: () => null, MoreDropdown: () => null }));

function RecentlyOpened() {
  const { recentRecords } = useSortedRecords();
  return (
    <output aria-label="Recently opened">
      {recentRecords.map(({ recordId }) => recordId).join(",")}
    </output>
  );
}

describe("MobileRecordPage", () => {
  it("counts the record as recently opened, however it was reached", () => {
    renderWithProviders(
      <SortedRecordsProvider>
        <Router hook={memoryLocation({ path: recordPaths.record("github") }).hook}>
          <Route path={recordPaths.detail} component={MobileRecordPage} />
        </Router>
        <RecentlyOpened />
      </SortedRecordsProvider>,
    );
    expect(screen.getByRole("status", { name: "Recently opened" })).toHaveTextContent("github");
  });
});
