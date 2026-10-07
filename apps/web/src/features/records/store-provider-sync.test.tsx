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
    push: { mutate: vi.fn() },
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
    cursors: {},
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

  it("pushes pending local versions in one record.push before pulling", async () => {
    const row = {
      recordId: "r1",
      vaultId: "v1",
      encryptedData: "data",
      encryptionNonce: "nonce",
      cryptoVersion: 1,
      clientUpdatedAt: "2026-10-05T00:00:00.000Z",
      deleted_at: null,
    };
    const deletedAt = "2026-10-05T00:00:00.000Z";
    const versions = [
      { ...row, version: 1 },
      { ...row, version: 2 },
      { ...row, version: 3, deleted_at: deletedAt },
    ];
    vault.getPendingChanges.mockResolvedValueOnce(
      versions.map((record, i) => ({
        changeId: `c${i + 1}`,
        attempts: 0,
        lastError: null,
        record,
      })),
    );
    trpcClient.record.push.mutate.mockImplementation(
      async ({ changes }: { changes: { clientChangeId: string }[] }) => ({
        results: changes.map((c, i) => ({
          clientChangeId: c.clientChangeId,
          status: "applied",
          record: versions[i],
        })),
      }),
    );

    renderWithProviders(ui("online"));

    await waitFor(() => expect(trpcClient.record.sync.query).toHaveBeenCalled());
    const { clientUpdatedAt, encryptedData, encryptionNonce, cryptoVersion } = row;
    const common = { recordId: "r1", vaultId: "v1", clientUpdatedAt };
    const ciphertext = { encryptedData, encryptionNonce, cryptoVersion };
    expect(trpcClient.record.push.mutate).toHaveBeenCalledExactlyOnceWith({
      changes: [
        { ...common, ...ciphertext, op: "put", clientChangeId: "c1", baseVersion: 0 },
        { ...common, ...ciphertext, op: "put", clientChangeId: "c2", baseVersion: 1 },
        { ...common, op: "delete", clientChangeId: "c3", baseVersion: 2 },
      ],
    });
    expect(vault.ackPendingChange.mock.calls).toEqual(
      versions.map((record, i) => [`c${i + 1}`, record]),
    );
  });

  it("stops the round when the server is busy, counting no change as failed", async () => {
    vault.getPendingChanges.mockResolvedValueOnce([
      {
        changeId: "c1",
        attempts: 0,
        lastError: null,
        record: {
          recordId: "r1",
          vaultId: "v1",
          encryptedData: "data",
          encryptionNonce: "nonce",
          cryptoVersion: 1,
          clientUpdatedAt: "2026-10-05T00:00:00.000Z",
          version: 1,
        },
      },
    ]);
    trpcClient.record.push.mutate.mockRejectedValue(
      TRPCClientError.from({
        error: {
          code: -32603,
          message: "busy",
          data: { code: "SERVICE_UNAVAILABLE", httpStatus: 503 },
        },
      }),
    );

    renderWithProviders(ui("online"));

    await waitFor(() => expect(trpcClient.record.push.mutate).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(vault.failPendingChange).not.toHaveBeenCalled();
    expect(trpcClient.record.sync.query).not.toHaveBeenCalled();
    expect(detachServer).not.toHaveBeenCalled();
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
    trpcClient.record.push.mutate.mockRejectedValue(
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
    expect(trpcClient.record.push.mutate).toHaveBeenCalledTimes(1);
    expect(vault.failPendingChange).not.toHaveBeenCalled();
    expect(trpcClient.record.sync.query).not.toHaveBeenCalled();
  });
});
