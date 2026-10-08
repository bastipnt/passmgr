import { useRecovery } from "@repo/client/src/hooks/use-recovery";
import type { LocalProfile } from "@repo/store";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";

const recoverAccount = vi.hoisted(() => vi.fn());
vi.mock("@repo/client/src/recover", async (importActual) => ({
  ...(await importActual<object>()),
  recoverAccount,
}));
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => ({}),
}));

const ALICE: LocalProfile = {
  profileId: "p-alice",
  mode: "linked",
  email: "alice@example.com",
  userId: "u-alice",
};
const BOB: LocalProfile = {
  profileId: "p-bob",
  mode: "linked",
  email: "bob@example.com",
  userId: "u-bob",
};

const store = createFakeStore();
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
  // Bob is active: the recovered account's profile needn't be.
  Object.assign(store, { profiles: [profileEntry(BOB), profileEntry(ALICE)], profile: BOB });
});

describe("useRecovery", () => {
  it("removes this device's stale profile of the recovered account", async () => {
    await recover();

    expect(store.removeProfile).toHaveBeenCalledWith(ALICE.profileId);
    expect(store.forgetQuickUnlock).not.toHaveBeenCalled();
  });

  it("keeps the profile when it holds unsynced changes, dropping only the quick unlocks", async () => {
    store.countPendingChanges.mockResolvedValueOnce(3);

    await recover();

    expect(store.countPendingChanges).toHaveBeenCalledWith(ALICE.profileId);
    expect(store.removeProfile).not.toHaveBeenCalled();
    expect(store.forgetQuickUnlock).toHaveBeenCalledWith(ALICE.profileId);
  });

  it("leaves other accounts' profiles alone", async () => {
    await recover("carol@example.com");

    expect(store.removeProfile).not.toHaveBeenCalled();
    expect(store.forgetQuickUnlock).not.toHaveBeenCalled();
  });
});
