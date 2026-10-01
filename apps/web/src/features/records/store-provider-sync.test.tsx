import { SessionContext } from "@repo/client";
import { StoreProvider } from "@repo/client/src/providers/StoreProvider";
import type { Vault } from "@repo/store";
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
  getAccountKeyMaterial: vi.fn(async () => null),
  getBiometricKeyMaterial: vi.fn(async () => null),
  getLastSyncTimestamp: vi.fn(async () => null),
  setLastSyncTimestamp: vi.fn(),
  upsertRecords: vi.fn(),
} as unknown as Vault;

function session(vaultUnlocked: boolean) {
  return { loggedIn: true, vaultUnlocked, isOffline: false } as ContextType<typeof SessionContext>;
}

function ui(vaultUnlocked: boolean) {
  return (
    <SessionContext.Provider value={session(vaultUnlocked)}>
      <StoreProvider vault={vault}>{null}</StoreProvider>
    </SessionContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  trpcClient.record.sync.query.mockResolvedValue({
    records: [],
    serverTimestamp: "2026-10-01T00:00:00.000Z",
  });
});

describe("StoreProvider sync", () => {
  it("doesn't sync while logged in but still unlocking, and starts once the vault is unlocked", async () => {
    const { rerender } = renderWithProviders(ui(false));

    // Give any (wrongly) started sync a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(trpcClient.record.sync.query).not.toHaveBeenCalled();
    expect(trpcClient.record.onRecordChange.subscribe).not.toHaveBeenCalled();

    rerender(ui(true));

    await waitFor(() => expect(trpcClient.record.sync.query).toHaveBeenCalledTimes(1));
    expect(trpcClient.record.onRecordChange.subscribe).toHaveBeenCalledTimes(1);
  });
});
