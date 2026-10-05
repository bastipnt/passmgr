import { SessionContext, type SessionMode } from "@repo/client";
import { StoreProvider } from "@repo/client/src/providers/StoreProvider";
import type { Vault } from "@repo/store";
import { TRPCClientError } from "@trpc/client";
import type { ContextType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, waitFor } from "@/test/render";

const trpcClient = {
  record: {
    sync: { query: vi.fn() },
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
} as unknown as Vault;

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
      <StoreProvider vault={vault}>{null}</StoreProvider>
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
});
