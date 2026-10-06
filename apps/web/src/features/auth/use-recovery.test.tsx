import { useRecovery } from "@repo/client/src/hooks/use-recovery";
import type { LocalProfile } from "@repo/store";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recoverAccount = vi.hoisted(() => vi.fn());
vi.mock("@repo/client/src/recover", async (importActual) => ({
  ...(await importActual<object>()),
  recoverAccount,
}));
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => ({}),
}));

const store = {
  profile: {
    profileId: "p-1",
    mode: "linked",
    email: "alice@example.com",
    userId: "u-1",
  } as LocalProfile | null,
  vault: { countPendingChanges: vi.fn(async () => 0) },
  removeVault: vi.fn(),
  forgetQuickUnlock: vi.fn(),
};
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));

async function recover(email = "Alice@Example.com") {
  const { result } = renderHook(() => useRecovery());
  await act(async () => {
    await result.current.recover(email, "recovery-key", "new password");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  recoverAccount.mockResolvedValue(new Uint8Array(32));
});

describe("useRecovery", () => {
  it("drops this device's stale copy of the recovered account", async () => {
    await recover();

    expect(store.removeVault).toHaveBeenCalledTimes(1);
    expect(store.forgetQuickUnlock).not.toHaveBeenCalled();
  });

  it("keeps the vault when it holds unsynced changes, dropping only the quick unlocks", async () => {
    store.vault.countPendingChanges.mockResolvedValueOnce(3);

    await recover();

    expect(store.removeVault).not.toHaveBeenCalled();
    expect(store.forgetQuickUnlock).toHaveBeenCalledTimes(1);
  });

  it("leaves another account's vault alone", async () => {
    await recover("bob@example.com");

    expect(store.removeVault).not.toHaveBeenCalled();
    expect(store.forgetQuickUnlock).not.toHaveBeenCalled();
  });
});
