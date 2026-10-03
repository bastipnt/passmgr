import { SessionContext } from "@repo/client";
import { RecordsProvider, useRecordsContext } from "@repo/client/src/providers/RecordsProvider";
import type { EncryptedRecordSchema } from "@repo/schema";
import { renderHook, waitFor } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const decryptRecordWithWorker = vi.fn();
vi.mock("@repo/client/src/util/decrypt-record", () => ({
  decryptRecordWithWorker: (row: EncryptedRecordSchema) => decryptRecordWithWorker(row),
}));

function encrypted(recordId: string): EncryptedRecordSchema {
  return {
    recordId,
    vaultId: "0199a3c4-0000-7000-8000-00000000000a",
    version: 1,
    encryptedData: `data-${recordId}`,
    encryptionNonce: `nonce-${recordId}`,
    cryptoVersion: 1,
    clientUpdatedAt: "2026-10-01T00:00:00.000Z",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    deleted_at: null,
  };
}

type SyncListener = (event: { vaultsChanged: boolean }) => void;
let syncListener: SyncListener | undefined;
const store = {
  vault: { getAllLatest: vi.fn() },
  syncManager: {
    onSync: (listener: SyncListener) => {
      syncListener = listener;
      return () => undefined;
    },
  },
};
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));

function wrapper({ children }: { children: ReactNode }) {
  const session = { vaultUnlocked: true } as ContextType<typeof SessionContext>;
  return (
    <SessionContext.Provider value={session}>
      <RecordsProvider>{children}</RecordsProvider>
    </SessionContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  store.vault.getAllLatest.mockResolvedValue([encrypted("good"), encrypted("bad")]);
  decryptRecordWithWorker.mockImplementation(async ({ encryptedData }: EncryptedRecordSchema) => {
    if (encryptedData === "data-bad") throw new Error("invalid tag");
    return { schemaVersion: 1, title: encryptedData };
  });
});

describe("RecordsProvider", () => {
  it("shows the records that decrypt when another one fails", async () => {
    const { result } = renderHook(() => useRecordsContext(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.records.map((r) => r.recordId)).toEqual(["good"]);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/1 record\(s\) could not/));
  });

  it("retries a failed record on the next run, and doesn't re-decrypt the good one", async () => {
    const { result } = renderHook(() => useRecordsContext(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    decryptRecordWithWorker.mockClear();
    decryptRecordWithWorker.mockResolvedValue({ schemaVersion: 1, title: "recovered" });

    syncListener?.({ vaultsChanged: false });

    await waitFor(() => expect(result.current.records).toHaveLength(2));
    expect(decryptRecordWithWorker).toHaveBeenCalledTimes(1);
    expect(decryptRecordWithWorker).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: "bad", encryptedData: "data-bad" }),
    );
  });
});
