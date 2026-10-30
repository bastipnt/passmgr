import { SessionContext } from "@repo/client";
import { generateLocalVault } from "@repo/client/src/account/create-local-vault";
import { useRecovery } from "@repo/client/src/hooks/use-recovery";
import { LoginUnreachableError } from "@repo/client/src/login";
import { RecoveryFailedError } from "@repo/client/src/recover";
import {
  deriveRecoveryAuthKey,
  getPasswordKekParams,
  openPendingRecovery,
  retrievePRK,
  setPasswordKekParams,
  unwrapAccountKey,
  unwrapAccountKeyWithRecoveryKey,
} from "@repo/crypto";
import {
  type AccountKeyMaterial,
  getArgonBounds,
  pendingRecoverySchema,
  setArgonBounds,
} from "@repo/schema";
import type { LocalProfile } from "@repo/store";
import { fromBase64, toBase64 } from "@repo/util";
import { act, renderHook } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";

const { recoverAccount, finishPendingRecovery } = vi.hoisted(() => ({
  recoverAccount: vi.fn(),
  finishPendingRecovery: vi.fn(),
}));
vi.mock("@repo/client/src/recover", async (importActual) => ({
  ...(await importActual<object>()),
  recoverAccount,
  finishPendingRecovery,
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

describe("useRecovery — checking the key first", () => {
  async function check(recoveryKey: string) {
    const { result } = renderHook(() => useRecovery());
    let ok = false;
    await act(async () => {
      ok = await result.current.checkRecoveryKey(recoveryKey, "alice@example.com");
    });
    return { ok, error: result.current.recoveryError };
  }

  it("accepts a well-formed account key without asking the server", async () => {
    expect(await check(toBase64(new Uint8Array(32).fill(7)))).toEqual({
      ok: true,
      error: undefined,
    });
    expect(recoverAccount).not.toHaveBeenCalled();
  });

  it("refuses a malformed one", async () => {
    expect(await check("not a key")).toEqual({ ok: false, error: "invalid_key" });
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
  const NEW_PASSWORD = "a brand new password";

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

  async function checkLocal(recoveryKey: string) {
    const { result } = renderHook(() => useRecovery());
    let ok = false;
    await act(async () => {
      ok = await result.current.checkRecoveryKey(recoveryKey);
    });
    return { ok, error: result.current.recoveryError };
  }

  it("checks the recovery key against the vault before the new password", async () => {
    expect(await checkLocal(toBase64(local.recoveryKey))).toEqual({ ok: true, error: undefined });

    const other = await generateLocalVault(PASSWORD);
    expect(await checkLocal(toBase64(other.recoveryKey))).toEqual({
      ok: false,
      error: "wrong_key",
    });
    expect(await checkLocal("not a key")).toEqual({ ok: false, error: "invalid_key" });
    expect(store.saveLocalKeyMaterial).not.toHaveBeenCalled();
  });

  it("only recovers a local profile", async () => {
    Object.assign(store, { profile: ALICE });

    const { error } = await recoverLocal(toBase64(local.recoveryKey));

    expect(error).toBe("failed");
    expect(store.saveLocalKeyMaterial).not.toHaveBeenCalled();
  });
});

describe("useRecovery — account vault on this device", () => {
  const PASSWORD = "hunter2hunter2";
  const NEW_PASSWORD = "a brand new password";

  const previous = getPasswordKekParams();
  const bounds = getArgonBounds();
  beforeAll(() => {
    setPasswordKekParams({ t: 1, m: 8, p: 1 });
    // The pending recovery's key set is validated like the server's input.
    setArgonBounds({ tMin: 1, mMin: 8, mMultipleOf: 1 });
  });
  afterAll(() => {
    setPasswordKekParams(previous);
    setArgonBounds(bounds);
  });

  let keyring: Awaited<ReturnType<typeof generateLocalVault>>;

  beforeEach(async () => {
    keyring = await generateLocalVault(PASSWORD);
    Object.assign(store, {
      profiles: [profileEntry(BOB), profileEntry(ALICE)],
      profile: BOB,
      accountKeyMaterial: keyring.material,
      pendingRecovery: false,
    });
    const { recoveryVerifier: _, ...wrap } = keyring.recovery;
    store.vault.getRecoveryWrap.mockResolvedValue(wrap);
    store.vault.getVaults.mockResolvedValue(keyring.vaults);
    store.vault.getPendingRecovery.mockResolvedValue(null);
  });

  function render(networkOffline: boolean) {
    const session = { networkOffline } as ContextType<typeof SessionContext>;
    return renderHook(() => useRecovery(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
      ),
    }).result;
  }

  async function recoverWith(recoveryKey: Uint8Array, networkOffline = true) {
    const result = render(networkOffline);
    let newKey: Uint8Array | undefined;
    await act(async () => {
      newKey = await result.current.recover(
        "alice@example.com",
        toBase64(recoveryKey),
        NEW_PASSWORD,
      );
    });
    return { newKey, error: result.current.recoveryError };
  }

  function pendingOf(call: unknown[]) {
    const sealed = call[3] as Parameters<typeof openPendingRecovery>[1];
    const plaintext = openPendingRecovery(keyring.accountKey, sealed);
    return pendingRecoverySchema.parse(JSON.parse(new TextDecoder().decode(plaintext)));
  }

  it("resets offline on the device and keeps the server's part for later", async () => {
    const { newKey, error } = await recoverWith(keyring.recoveryKey);

    expect(error).toBeUndefined();
    expect(store.selectProfile).toHaveBeenCalledWith(ALICE.profileId);
    const call = store.saveLinkedRecovery.mock.calls[0]!;
    const [profileId, material, recoveryWrap] = call;
    expect(profileId).toBe(ALICE.profileId);
    const kek = await retrievePRK(
      NEW_PASSWORD,
      fromBase64(material.passwordKekSalt),
      material.passwordKekParams,
    );
    expect(
      unwrapAccountKey(kek, material.encryptedAccountKey, material.accountKeyEncryptionNonce),
    ).toEqual(keyring.accountKey);
    expect(await unwrapAccountKeyWithRecoveryKey(newKey!, recoveryWrap)).toEqual(
      keyring.accountKey,
    );
    expect(recoveryWrap).not.toHaveProperty("recoveryVerifier");

    // The server's proof is the old key's; the key set is the one just made.
    const pending = pendingOf(call);
    expect(pending.recoveryAuthKey).toBe(
      toBase64(await deriveRecoveryAuthKey(keyring.recoveryKey)),
    );
    expect(pending.userKeys).toMatchObject(recoveryWrap);
    expect(pending.userKeys.encryptedAccountKey).toBe(material.encryptedAccountKey);
    expect(store.forgetQuickUnlock).toHaveBeenCalledWith(ALICE.profileId);
    expect(recoverAccount).not.toHaveBeenCalled();
  });

  it("online, hands the reset to the server right away and keeps nothing pending", async () => {
    finishPendingRecovery.mockResolvedValueOnce(undefined);

    const { newKey } = await recoverWith(keyring.recoveryKey, false);

    expect(newKey).toHaveLength(32);
    const call = store.saveLinkedRecovery.mock.calls[0]!;
    expect(finishPendingRecovery).toHaveBeenCalledWith(
      expect.anything(),
      "alice@example.com",
      expect.any(Uint8Array),
      pendingOf(call),
    );
    expect(store.clearPendingRecovery).toHaveBeenCalledWith(ALICE.profileId);
    expect(recoverAccount).not.toHaveBeenCalled();
    expect(store.removeProfile).not.toHaveBeenCalled();
  });

  it("online, changes nothing when the server refuses (a stale cached wrap)", async () => {
    finishPendingRecovery.mockRejectedValueOnce(new RecoveryFailedError());

    const { newKey, error } = await recoverWith(keyring.recoveryKey, false);

    expect(newKey).toBeUndefined();
    expect(error).toBe("failed");
    expect(store.saveLinkedRecovery).not.toHaveBeenCalled();
    expect(store.forgetQuickUnlock).not.toHaveBeenCalled();
  });

  it("online but unreachable, keeps the reset pending for the next connect", async () => {
    finishPendingRecovery.mockRejectedValueOnce(new LoginUnreachableError());

    await recoverWith(keyring.recoveryKey, false);

    expect(store.saveLinkedRecovery).toHaveBeenCalled();
    expect(store.clearPendingRecovery).not.toHaveBeenCalled();
  });

  it("keeps an earlier pending reset's proof: the server still knows only that key", async () => {
    const first = await recoverWith(keyring.recoveryKey);
    const firstCall = store.saveLinkedRecovery.mock.calls[0]!;
    store.vault.getRecoveryWrap.mockResolvedValue(firstCall[2]);
    store.vault.getPendingRecovery.mockResolvedValue(firstCall[3]);

    await recoverWith(first.newKey!);

    const pending = pendingOf(store.saveLinkedRecovery.mock.calls[1]!);
    expect(pending.recoveryAuthKey).toBe(pendingOf(firstCall).recoveryAuthKey);
  });

  it("refuses a key that doesn't open the cached wrap while offline", async () => {
    const other = await generateLocalVault(PASSWORD);

    const { newKey, error } = await recoverWith(other.recoveryKey);

    expect(newKey).toBeUndefined();
    expect(error).toBe("wrong_key");
    expect(store.saveLinkedRecovery).not.toHaveBeenCalled();
  });

  it("leaves a key the cached wrap doesn't open to the server when online", async () => {
    const other = await generateLocalVault(PASSWORD);

    await recoverWith(other.recoveryKey, false);

    expect(store.saveLinkedRecovery).not.toHaveBeenCalled();
    expect(recoverAccount).toHaveBeenCalled();
  });

  it("needs the server for an account without a cached wrap", async () => {
    store.vault.getRecoveryWrap.mockResolvedValue(null);

    const { error } = await recoverWith(keyring.recoveryKey);

    expect(error).toBe("offline");
    expect(store.saveLinkedRecovery).not.toHaveBeenCalled();
  });
});
