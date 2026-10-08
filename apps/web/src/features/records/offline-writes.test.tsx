import { useRecordHistory } from "@repo/client/src/hooks/use-record-history";
import { useUpdateRecord } from "@repo/client/src/hooks/use-update-record";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const records = {
  update: vi.fn(async () => ({ recordId: "r1" })),
  history: vi.fn(async () => [] as unknown[]),
};
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => ({ records, current: () => ({ records }) }),
}));
const refreshRecord = vi.fn(async () => undefined);
vi.mock("@repo/client/src/providers/RecordsProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useRecordsContext: () => ({ refreshRecord, revision: 1 }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

// What the browser's offline mode (devtools, airplane mode) tells React Query.
beforeEach(() => onlineManager.setOnline(false));
afterEach(() => onlineManager.setOnline(true));

describe("record writes while the browser is offline", () => {
  it("saves an edit instead of waiting for the network", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useUpdateRecord({ onSuccess }), { wrapper });

    act(() =>
      result.current.updateRecord(
        { recordId: "r1", vaultId: "v1" } as DecryptedRecord,
        { type: "login", title: "t" } as RecordData,
      ),
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(records.update).toHaveBeenCalledTimes(1);
    expect(result.current.updatePending).toBe(false);
  });

  it("reads the version history", async () => {
    const { result } = renderHook(() => useRecordHistory("r1"), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(records.history).toHaveBeenCalledWith("r1");
  });
});
