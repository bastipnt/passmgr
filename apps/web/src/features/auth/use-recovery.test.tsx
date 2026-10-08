import { SessionContext } from "@repo/client";
import { generateLocalVault } from "@repo/client/src/account/create-local-vault";
import { useRecovery } from "@repo/client/src/hooks/use-recovery";
import {
  getPasswordKekParams,
  retrievePRK,
  setPasswordKekParams,
  unwrapAccountKey,
  unwrapAccountKeyWithRecoveryKey,
} from "@repo/crypto";
import type { AccountKeyMaterial } from "@repo/schema";
import type { LocalProfile } from "@repo/store";
import { fromBase64, toBase64 } from "@repo/util";
import { act, renderHook } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";

const recoverAccount = vi.hoisted(() => vi.fn());
vi.mock("@repo/client/src/recover", async (importActual) => ({
  ...(await importActual<object>()),
  recoverAccount,
}));
// The real Argon2 derivation, on the main thread (no workers here).
vi.mock("@repo/crypto/services/argon2-worker-service", async () => {
  const { retrievePRK: derive } = await import("@repo/crypto");
  return { argon2WorkerService: { derive } };
});
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

describe("useRecovery — offline", () => {
  it("refuses an account's recovery while the device is offline", async () => {
    const session = { networkOffline: true } as ContextType<typeof SessionContext>;
    const { result } = renderHook(() => useRecovery(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
      ),
    });

    await act(async () => {
      expect(await result.current.recover(ALICE.email, "recovery-key", "new password")).toBe(
        undefined,
      );
    });

    expect(result.current.recoveryError).toBe("offline");
    expect(recoverAccount).not.toHaveBeenCalled();
    expect(store.removeProfile).not.toHaveBeenCalled();
  });
});

describe("useRecovery — local vault", () => {
  const PASSWORD = "hunter2hunter2";
  const NEW_PASSWORD = "a brand new master password";

  const previous = getPasswordKekParams();
  beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
  afterAll(() => setPasswordKekParams(previous));

  let local: Awaited<ReturnType<typeof generateLocalVault>>;

  beforeEach(async () => {
    local = await generateLocalVault(PASSWORD);
    Object.assign(store, {
      profiles: [profileEntry(local.profile)],
      profile: local.profile,
      accountKeyMaterial: local.material,
    });
    store.vault.getRecoveryKeyMaterial.mockResolvedValue(local.recovery);
    store.vault.getVaults.mockResolvedValue(local.vaults);
  });

  async function open(material: AccountKeyMaterial, password: string) {
    const kek = await retrievePRK(
      password,
      fromBase64(material.passwordKekSalt),
      material.passwordKekParams,
    );
    return unwrapAccountKey(kek, material.encryptedAccountKey, material.accountKeyEncryptionNonce);
  }

  async function recoverLocal(recoveryKey: string) {
    const { result } = renderHook(() => useRecovery());
    let newKey: Uint8Array | undefined;
    await act(async () => {
      newKey = await result.current.recoverLocal(recoveryKey, NEW_PASSWORD);
    });
    return { newKey, error: result.current.recoveryError };
  }

  it("rewraps the same account key under the new password and a new recovery key", async () => {
    const { newKey, error } = await recoverLocal(toBase64(local.recoveryKey));

    expect(error).toBeUndefined();
    expect(newKey).toHaveLength(32);
    const [profileId, material, recovery] = store.saveLocalKeyMaterial.mock.calls[0]!;
    expect(profileId).toBe(local.profile.profileId);
    // Same account key: the vault keys (and every record) still open.
    expect(await open(material, NEW_PASSWORD)).toEqual(local.accountKey);
    await expect(open(material, PASSWORD)).rejects.toThrow();
    expect(material.userKeyPair).toEqual(local.material.userKeyPair);
    // The new recovery key opens the new wrap; the old one doesn't.
    expect(await unwrapAccountKeyWithRecoveryKey(newKey!, recovery)).toEqual(local.accountKey);
    await expect(unwrapAccountKeyWithRecoveryKey(local.recoveryKey, recovery)).rejects.toThrow();
    expect(recovery.recoveryVerifier).not.toBe(local.recovery.recoveryVerifier);
    // Nothing opens it without the new password any more.
    expect(store.forgetQuickUnlock).toHaveBeenCalledWith(local.profile.profileId);
    expect(recoverAccount).not.toHaveBeenCalled();
  });

  it("works offline: no server involved", async () => {
    const session = { networkOffline: true } as ContextType<typeof SessionContext>;
    const { result } = renderHook(() => useRecovery(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
      ),
    });

    await act(async () => {
      expect(
        await result.current.recoverLocal(toBase64(local.recoveryKey), NEW_PASSWORD),
      ).toHaveLength(32);
    });
    expect(store.saveLocalKeyMaterial).toHaveBeenCalled();
  });

  it("refuses a recovery key that doesn't open this vault", async () => {
    const other = await generateLocalVault(PASSWORD);

    const { newKey, error } = await recoverLocal(toBase64(other.recoveryKey));

    expect(newKey).toBeUndefined();
    expect(error).toBe("wrong_key");
    expect(store.saveLocalKeyMaterial).not.toHaveBeenCalled();
    expect(store.forgetQuickUnlock).not.toHaveBeenCalled();
  });

  it("never overwrites the wraps with a key that doesn't open the vault", async () => {
    // A recovery wrap of another keyring: it opens, but to the wrong account key.
    const other = await generateLocalVault(PASSWORD);
    store.vault.getRecoveryKeyMaterial.mockResolvedValue(other.recovery);

    const { newKey, error } = await recoverLocal(toBase64(other.recoveryKey));

    expect(newKey).toBeUndefined();
    expect(error).toBe("failed");
    expect(store.saveLocalKeyMaterial).not.toHaveBeenCalled();
    expect(store.forgetQuickUnlock).not.toHaveBeenCalled();
  });

  it("refuses a malformed recovery key", async () => {
    const { error } = await recoverLocal("not a key");

    expect(error).toBe("invalid_key");
    expect(store.saveLocalKeyMaterial).not.toHaveBeenCalled();
  });

  it("only recovers a local profile", async () => {
    Object.assign(store, { profile: ALICE });

    const { error } = await recoverLocal(toBase64(local.recoveryKey));

    expect(error).toBe("failed");
    expect(store.saveLocalKeyMaterial).not.toHaveBeenCalled();
  });
});
