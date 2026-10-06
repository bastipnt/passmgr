import { SessionContext, type SessionMode } from "@repo/client";
import { StoreProvider } from "@repo/client/src/providers/StoreProvider";
import type { PendingChange, Vault } from "@repo/store";
import { TRPCClientError } from "@trpc/client";
import type { ContextType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, waitFor } from "@/test/render";

const trpcClient = {
  record: {
    sync: { query: vi.fn() },
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    delete: { mutate: vi.fn() },
    onRecordChange: { subscribe: vi.fn(() => ({ unsubscribe: () => undefined })) },
  },
};
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => trpcClient,
}));

const vault = {
  getProfile: vi.fn(async () => null),
  getAccountKeyMaterial: vi.fn(async () => null),
  getBiometricKeyMaterial: vi.fn(async () => null),
  getSyncCursors: vi.fn(async () => ({})),
  applySync: vi.fn(async () => false),
  getPendingChanges: vi.fn(async (): Promise<PendingChange[]> => []),
  ackPendingChange: vi.fn(async () => undefined),
  failPendingChange: vi.fn(async () => undefined),
};

const detachServer = vi.fn();

function session(mode: SessionMode | undefined) {
  return {
    vaultUnlocked: mode !== undefined,
    mode,
    networkOffline: false,
    detachServer,
    lock: vi.fn(),
  } as unknown as ContextType<typeof SessionContext>;
}

function ui(mode: SessionMode | undefined) {
  return (
    <SessionContext.Provider value={session(mode)}>
      <StoreProvider vault={vault as unknown as Vault}>{null}</StoreProvider>
    </SessionContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  trpcClient.record.sync.query.mockResolvedValue({
    records: [],
    vaults: [],
    serverTimestamp: "2026-10-01T00:00:00.000Z",
  });
});

describe("StoreProvider sync", () => {
  it("doesn't sync while logged in but still unlocking, and starts once the vault is unlocked", async () => {
    const { rerender } = renderWithProviders(ui(undefined));

    // Give any (wrongly) started sync a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(trpcClient.record.sync.query).not.toHaveBeenCalled();
    expect(trpcClient.record.onRecordChange.subscribe).not.toHaveBeenCalled();

    rerender(ui("online"));

    await waitFor(() => expect(trpcClient.record.sync.query).toHaveBeenCalledTimes(1));
    expect(trpcClient.record.onRecordChange.subscribe).toHaveBeenCalledTimes(1);
  });

  it.each(["local", "offline"] as const)("never reaches the server in %s mode", async (mode) => {
    renderWithProviders(ui(mode));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(trpcClient.record.sync.query).not.toHaveBeenCalled();
    expect(trpcClient.record.onRecordChange.subscribe).not.toHaveBeenCalled();
  });

  it("goes offline when the server rejects the session", async () => {
    trpcClient.record.sync.query.mockRejectedValue(
      TRPCClientError.from({
        error: {
          code: -32001,
          message: "UNAUTHORIZED",
          data: { code: "UNAUTHORIZED", httpStatus: 401 },
        },
      }),
    );
    renderWithProviders(ui("online"));

    await waitFor(() => expect(detachServer).toHaveBeenCalledTimes(1));
  });

  it("pushes pending local versions through the record mutations before pulling", async () => {
    const row = {
      recordId: "r1",
      vaultId: "v1",
      encryptedData: "data",
      encryptionNonce: "nonce",
      cryptoVersion: 1,
      clientUpdatedAt: "2026-10-05T00:00:00.000Z",
      deleted_at: null,
    };
    const created = { ...row, version: 1 };
    vault.getPendingChanges.mockResolvedValueOnce([
      { changeId: "c1", attempts: 0, lastError: null, record: created },
      { changeId: "c2", attempts: 0, lastError: null, record: { ...row, version: 2 } },
      {
        changeId: "c3",
        attempts: 0,
        lastError: null,
        record: { ...row, version: 3, deleted_at: "2026-10-05T00:00:00.000Z" },
      },
    ]);
    trpcClient.record.create.mutate.mockResolvedValue(created);
    trpcClient.record.update.mutate.mockResolvedValue({ ...row, version: 2 });
    trpcClient.record.delete.mutate.mockResolvedValue(undefined);

    renderWithProviders(ui("online"));

    await waitFor(() => expect(trpcClient.record.sync.query).toHaveBeenCalled());
    const { clientUpdatedAt, encryptedData, encryptionNonce, cryptoVersion } = row;
    const body = { recordId: "r1", encryptedData, encryptionNonce, cryptoVersion, clientUpdatedAt };
    expect(trpcClient.record.create.mutate).toHaveBeenCalledWith({ ...body, vaultId: "v1" });
    expect(trpcClient.record.update.mutate).toHaveBeenCalledWith({ ...body, version: 1 });
    expect(trpcClient.record.delete.mutate).toHaveBeenCalledWith({ recordId: "r1", version: 2 });
    expect(vault.ackPendingChange.mock.calls).toEqual([
      ["c1", created],
      ["c2", { ...row, version: 2 }],
      ["c3", null],
    ]);
  });

  it("stops pushing at a rejected session: detaches once, counts no change as failed", async () => {
    const record = {
      recordId: "r1",
      vaultId: "v1",
      encryptedData: "data",
      encryptionNonce: "nonce",
      cryptoVersion: 1,
      clientUpdatedAt: "2026-10-05T00:00:00.000Z",
      version: 1,
    };
    vault.getPendingChanges.mockResolvedValueOnce([
      { changeId: "c1", attempts: 0, lastError: null, record },
      { changeId: "c2", attempts: 0, lastError: null, record: { ...record, recordId: "r2" } },
    ]);
    trpcClient.record.create.mutate.mockRejectedValue(
      TRPCClientError.from({
        error: {
          code: -32001,
          message: "UNAUTHORIZED",
          data: { code: "UNAUTHORIZED", httpStatus: 401 },
        },
      }),
    );

    renderWithProviders(ui("online"));

    await waitFor(() => expect(detachServer).toHaveBeenCalledTimes(1));
    expect(trpcClient.record.create.mutate).toHaveBeenCalledTimes(1);
    expect(vault.failPendingChange).not.toHaveBeenCalled();
    expect(trpcClient.record.sync.query).not.toHaveBeenCalled();
  });
});
