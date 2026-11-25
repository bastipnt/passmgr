import { SessionContext } from "@repo/client";
import { RecordsProvider, useRecordsContext } from "@repo/client/src/providers/RecordsProvider";
import type { EncryptedRecordSchema } from "@repo/schema";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const decryptRecordWithWorker = vi.fn();
vi.mock("@repo/client/src/util/decrypt-record", () => ({
  decryptRecordRow: async (row: EncryptedRecordSchema) => ({
    ...(await decryptRecordWithWorker(row)),
    recordId: row.recordId,
    vaultId: row.vaultId,
  }),
}));

function encrypted(recordId: string): EncryptedRecordSchema {
  return {
    recordId,
    vaultId: "0199a3c4-0000-7000-8000-00000000000a",
    version: 1,
    encryptedData: `data-${recordId}`,
    encryptionNonce: `nonce-${recordId}`,
    cryptoVersion: 1,
    keyVersion: 1,
    clientUpdatedAt: "2026-10-01T00:00:00.000Z",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    deleted_at: null,
  };
}

type SyncListener = (event: { vaultsChanged: boolean }) => void;
let syncListener: SyncListener | undefined;
const store = {
  vault: { getAllLatest: vi.fn(), getVaults: vi.fn(async () => []) },
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

let vaultUnlocked = true;
function wrapper({ children }: { children: ReactNode }) {
  const session = { vaultUnlocked } as ContextType<typeof SessionContext>;
  return (
    <SessionContext.Provider value={session}>
      <RecordsProvider>{children}</RecordsProvider>
    </SessionContext.Provider>
  );
}

beforeEach(() => {
  vaultUnlocked = true;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  store.vault.getAllLatest.mockResolvedValue([encrypted("good"), encrypted("bad")]);
  decryptRecordWithWorker.mockImplementation(async ({ encryptedData }: EncryptedRecordSchema) => {
    if (encryptedData === "data-bad") throw new Error("invalid tag");
    return { schemaVersion: 1, type: "login", title: encryptedData };
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
    decryptRecordWithWorker.mockResolvedValue({
      schemaVersion: 1,
      type: "login",
      title: "recovered",
    });

    syncListener?.({ vaultsChanged: false });

    await waitFor(() => expect(result.current.records).toHaveLength(2));
    expect(decryptRecordWithWorker).toHaveBeenCalledTimes(1);
    expect(decryptRecordWithWorker).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: "bad", encryptedData: "data-bad" }),
    );
  });

  it("keeps the list and the context value as they were after a sync that changed nothing", async () => {
    const { result } = renderHook(() => useRecordsContext(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { records, revision } = result.current;
    decryptRecordWithWorker.mockClear();

    syncListener?.({ vaultsChanged: false });

    await waitFor(() => expect(result.current.revision).toBeGreaterThan(revision));
    // Only "bad" is retried, and it fails again: the list holds the same records.
    expect(decryptRecordWithWorker).toHaveBeenCalledTimes(1);
    expect(result.current.records).toBe(records);
  });

  it("re-decrypts a record whose nonce changed, and gives the list a new identity", async () => {
    store.vault.getAllLatest.mockResolvedValue([encrypted("good")]);
    const { result } = renderHook(() => useRecordsContext(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { records } = result.current;
    decryptRecordWithWorker.mockClear();
    store.vault.getAllLatest.mockResolvedValue([
      { ...encrypted("good"), encryptedData: "data-good-2", encryptionNonce: "nonce-good-2" },
    ]);

    syncListener?.({ vaultsChanged: false });

    await waitFor(() => expect(result.current.records).not.toBe(records));
    expect(decryptRecordWithWorker).toHaveBeenCalledTimes(1);
    expect(result.current.records[0]?.title).toBe("data-good-2");
  });

  it("exposes no records once locked", async () => {
    const { result, rerender } = renderHook(() => useRecordsContext(), { wrapper });
    await waitFor(() => expect(result.current.records).toHaveLength(1));

    vaultUnlocked = false;
    rerender();

    expect(result.current.records).toEqual([]);
    expect(result.current.getRecord("good")).toBeUndefined();
    expect(result.current.ready).toBe(false);
  });

  it("doesn't run a decryption queued before the lock", async () => {
    const { result, rerender } = renderHook(() => useRecordsContext(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    let release: () => void = () => undefined;
    store.vault.getAllLatest.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve([encrypted("good")]))),
    );
    store.vault.getAllLatest.mockClear();
    syncListener?.({ vaultsChanged: false });
    syncListener?.({ vaultsChanged: false });
    await waitFor(() => expect(store.vault.getAllLatest).toHaveBeenCalledTimes(1));

    vaultUnlocked = false;
    rerender();
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(store.vault.getAllLatest).toHaveBeenCalledTimes(1);
    expect(result.current.ready).toBe(false);
  });

  it("drops a decryption that finishes after the lock", async () => {
    const pending: (() => void)[] = [];
    decryptRecordWithWorker.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(() => resolve({ schemaVersion: 1, type: "login", title: "late" }));
        }),
    );
    const { result, rerender } = renderHook(() => useRecordsContext(), { wrapper });
    await waitFor(() => expect(pending).toHaveLength(2));

    vaultUnlocked = false;
    rerender();
    await act(async () => {
      for (const finish of pending) finish();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(result.current.records).toEqual([]);
    expect(result.current.ready).toBe(false);
  });
});
