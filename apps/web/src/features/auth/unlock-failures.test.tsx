import { SessionContext } from "@repo/client";
import { useSessionRestore } from "@repo/client/src/hooks/use-session-restore";
import { useUnlock } from "@repo/client/src/hooks/use-unlock";
import { loginUser as loginUserCore } from "@repo/client/src/login";
import {
  createUserKeyPair,
  genKey,
  getPasswordKekParams,
  wrapAccountKey,
  wrapVaultKey,
} from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import type { MemberVault, UserKeyPair } from "@repo/schema";
import { clearLoginBundle, type LoginBundle, loadLoginBundle, secretsStore } from "@repo/store";
import { toBase64 } from "@repo/util";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Real hooks and the real secretsStore; only I/O at the edges is replaced.
vi.mock("@repo/store", async (importActual) => ({
  ...(await importActual<object>()),
  isPersistentLoginAvailable: () => true,
  loadLoginBundle: vi.fn(),
  clearLoginBundle: vi.fn(),
  persistLoginBundle: vi.fn(),
}));
vi.mock("@repo/crypto", async (importActual) => ({
  ...(await importActual<object>()),
  authenticateBiometric: vi.fn(),
}));
vi.mock("@repo/client/src/login", async (importActual) => ({
  ...(await importActual<object>()),
  loginUser: vi.fn(),
}));
vi.mock("@repo/crypto/services/argon2-worker-service", () => ({
  argon2WorkerService: { derive: vi.fn() },
}));
vi.mock("@repo/crypto/services/decrypt-worker-service", () => ({
  decryptWorkerService: { init: vi.fn() },
}));

const trpcClient = {
  login: { logout: { mutate: vi.fn() } },
  user: { heartbeat: { query: vi.fn() } },
};
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => trpcClient,
}));

const passwordKeys = {
  passwordKekParams: { t: 3, m: 65536, p: 1 },
  passwordKekSalt: "salt",
  encryptedAccountKey: "enc",
  accountKeyEncryptionNonce: "nonce",
};

const store = {
  vault: {
    getVaults: vi.fn(),
    getAccountKeyMaterial: vi.fn(),
    setAccountKeyMaterial: vi.fn(),
    clear: vi.fn(),
  },
  accountKeyMaterial: {
    ...passwordKeys,
    email: "alice@example.com",
    userKeyPair: createUserKeyPair(genKey()),
  },
  biometricKeyMaterial: {},
  needsBiometricEnroll: false,
};
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));

const PERSONAL_ID = "0199a3c4-0000-7000-8000-00000000000a";

function keyring() {
  const accountKey = genKey();
  const wraps: MemberVault[] = [
    {
      ...wrapVaultKey(accountKey, genKey(), PERSONAL_ID, 1),
      kind: "personal",
      role: "owner",
      encryptedMeta: B64_32,
      metaEncryptionNonce: B64_32,
    },
  ];
  return { accountKey, wraps, userKeyPair: createUserKeyPair(accountKey) };
}

const B64_32 = toBase64(new Uint8Array(32));

/** Mirrors SessionProvider: loading the vault keys + keypair may throw, which locks again. */
function loadKeyringOrLock(wraps: readonly MemberVault[], keyPair: UserKeyPair) {
  try {
    secretsStore.loadVaultKeys(wraps);
    secretsStore.loadUserKeyPair(keyPair);
  } catch (e) {
    secretsStore.lockVault();
    throw e;
  }
}

const session = {
  restoreLogin: vi.fn(
    (bundle: Omit<LoginBundle, "email">, wraps: readonly MemberVault[], keyPair: UserKeyPair) => {
      secretsStore.restoreSession(bundle);
      loadKeyringOrLock(wraps, keyPair);
    },
  ),
  unlockWithAccountKey: vi.fn(
    (accountKey: Uint8Array, wraps: readonly MemberVault[], keyPair: UserKeyPair) => {
      secretsStore.unlockWithAccountKey(accountKey);
      loadKeyringOrLock(wraps, keyPair);
    },
  ),
  unlockVault: vi.fn(
    (
      kek: Uint8Array,
      encrypted: string,
      nonce: string,
      wraps: readonly MemberVault[],
      keyPair: UserKeyPair,
    ) => {
      secretsStore.unlockAccount(kek, encrypted, nonce);
      loadKeyringOrLock(wraps, keyPair);
    },
  ),
  endSession: vi.fn(),
  offlineLoginSession: vi.fn(),
  loginSession: vi.fn(async () => {
    secretsStore.sessionId = "live-session";
  }),
} as unknown as ContextType<typeof SessionContext>;

function wrapper({ children }: { children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  secretsStore.lock();
  trpcClient.user.heartbeat.query.mockResolvedValue({ ok: true });
});

describe("useSessionRestore failure paths", () => {
  async function restore() {
    const { result } = renderHook(() => useSessionRestore(), { wrapper });
    await act(() => result.current.tryRestore());
    return result.current.status;
  }

  it("falls back to login for a bundle from before the account key existed", async () => {
    vi.mocked(loadLoginBundle).mockResolvedValue({
      sessionId: "sid",
      authKeyB64: B64_32,
      authSaltB64: B64_32,
      vaultKeyB64: B64_32,
      email: "alice@example.com",
    } as unknown as LoginBundle);

    expect(await restore()).toBe("needs-login");
    expect(clearLoginBundle).toHaveBeenCalledTimes(1);
    expect(trpcClient.user.heartbeat.query).not.toHaveBeenCalled();
    expect(secretsStore.sessionId).toBeUndefined();
  });

  it("falls back to login when the cached vault keys don't open", async () => {
    const { wraps, userKeyPair } = keyring();
    store.vault.getAccountKeyMaterial.mockResolvedValue({
      ...store.accountKeyMaterial,
      userKeyPair,
    });
    vi.mocked(loadLoginBundle).mockResolvedValue({
      sessionId: "sid",
      authKeyB64: B64_32,
      authSaltB64: B64_32,
      accountKeyB64: toBase64(genKey()), // not the key the wraps were made with
      email: "alice@example.com",
    });
    store.vault.getVaults.mockResolvedValue(wraps);

    expect(await restore()).toBe("needs-login");
    expect(clearLoginBundle).toHaveBeenCalledTimes(1);
    expect(secretsStore.sessionId).toBeUndefined();
    expect(secretsStore.isVaultUnlocked).toBe(false);
  });

  it("falls back to login when the cached keypair isn't the user's", async () => {
    const { accountKey, wraps, userKeyPair } = keyring();
    const swapped = { ...userKeyPair, publicKey: createUserKeyPair(genKey()).publicKey };
    vi.mocked(loadLoginBundle).mockResolvedValue({
      sessionId: "sid",
      authKeyB64: B64_32,
      authSaltB64: B64_32,
      accountKeyB64: toBase64(accountKey),
      email: "alice@example.com",
    });
    store.vault.getVaults.mockResolvedValue(wraps);
    store.vault.getAccountKeyMaterial.mockResolvedValue({
      ...store.accountKeyMaterial,
      userKeyPair: swapped,
    });

    expect(await restore()).toBe("needs-login");
    expect(clearLoginBundle).toHaveBeenCalledTimes(1);
    expect(secretsStore.isVaultUnlocked).toBe(false);
    expect(secretsStore.userPublicKey).toBeUndefined();
  });

  it("restores a valid bundle with the cached vault keys and keypair", async () => {
    const { accountKey, wraps, userKeyPair } = keyring();
    store.vault.getAccountKeyMaterial.mockResolvedValue({
      ...store.accountKeyMaterial,
      userKeyPair,
    });
    vi.mocked(loadLoginBundle).mockResolvedValue({
      sessionId: "sid",
      authKeyB64: B64_32,
      authSaltB64: B64_32,
      accountKeyB64: toBase64(accountKey),
      email: "alice@example.com",
    });
    store.vault.getVaults.mockResolvedValue(wraps);

    expect(await restore()).toBe("restored");
    expect(clearLoginBundle).not.toHaveBeenCalled();
    expect(secretsStore.isVaultUnlocked).toBe(true);
    expect(secretsStore.userPublicKey).toBe(userKeyPair.publicKey);
  });
});

describe("biometricUnlock failure path", () => {
  it("revokes the fresh server session when the vault keys don't open", async () => {
    const { authenticateBiometric } = await import("@repo/crypto");
    const { wraps, userKeyPair } = keyring();
    vi.mocked(authenticateBiometric).mockResolvedValue({
      accountKey: genKey(), // not the key the wraps were made with
      password: "right password",
    });
    vi.mocked(loginUserCore).mockImplementation(async (_trpc, loginSession) => {
      await loginSession("live-session", "session-key", new Uint8Array(32));
      return {
        email: "alice@example.com",
        password: "right password",
        userPasswordKeys: passwordKeys,
        vaultKeys: wraps,
        userKeyPair,
      };
    });
    store.vault.getVaults.mockResolvedValue(wraps);

    const { result } = renderHook(() => useUnlock(), { wrapper });
    await act(async () => {
      await expect(result.current.biometricUnlock()).rejects.toThrow();
    });

    expect(trpcClient.login.logout.mutate).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(secretsStore.sessionId).toBeUndefined();
    expect(secretsStore.isVaultUnlocked).toBe(false);
    await waitFor(() => expect(result.current.unlockError).toBe("failed"));
  });
});

describe("unlock: whose local data is this?", () => {
  /** A login result for a fresh account, plus the KEK the mocked Argon2 hands out. */
  function account() {
    const kek = genKey();
    const { accountKey, wraps, userKeyPair } = keyring();
    const [encryptedAccountKey, accountKeyEncryptionNonce] = wrapAccountKey(kek, accountKey);
    const userPasswordKeys = {
      // Current params: no background rekey kicks in.
      passwordKekParams: getPasswordKekParams(),
      passwordKekSalt: toBase64(genKey()),
      encryptedAccountKey,
      accountKeyEncryptionNonce,
    };
    vi.mocked(argon2WorkerService.derive).mockImplementation(async () => kek.slice());
    return { userPasswordKeys, wraps, userKeyPair };
  }

  async function unlockWith(keys: ReturnType<typeof account>) {
    const { result } = renderHook(() => useUnlock(), { wrapper });
    let unlocked = false;
    await act(async () => {
      unlocked = await result.current.unlock({
        email: "Alice@Example.com",
        password: "pw",
        userPasswordKeys: keys.userPasswordKeys,
        vaultKeys: keys.wraps,
        userKeyPair: keys.userKeyPair,
      });
    });
    return unlocked;
  }

  it("clears leftover local data when nothing is cached for any account", async () => {
    const keys = account();
    Object.assign(store, { accountKeyMaterial: null });
    store.vault.getVaults.mockResolvedValue([]);

    expect(await unlockWith(keys)).toBe(true);
    expect(store.vault.clear).toHaveBeenCalledTimes(1);
    expect(store.vault.setAccountKeyMaterial).toHaveBeenCalledTimes(1);
  });

  it("clears the local data when the same email comes back with a new personal vault", async () => {
    const previous = account();
    const keys = account();
    Object.assign(store, {
      accountKeyMaterial: {
        ...previous.userPasswordKeys,
        email: "alice@example.com",
        userKeyPair: previous.userKeyPair,
      },
    });
    store.vault.getVaults.mockResolvedValue([
      { ...previous.wraps[0]!, vaultId: "0199a3c4-0000-7000-8000-0000000000ff" },
    ]);

    expect(await unlockWith(keys)).toBe(true);
    expect(store.vault.clear).toHaveBeenCalledTimes(1);
  });

  it("keeps the local data for the same account and skips the unchanged write", async () => {
    const keys = account();
    Object.assign(store, {
      accountKeyMaterial: {
        ...keys.userPasswordKeys,
        email: "alice@example.com",
        userKeyPair: keys.userKeyPair,
      },
    });
    store.vault.getVaults.mockResolvedValue(keys.wraps);

    expect(await unlockWith(keys)).toBe(true);
    expect(store.vault.clear).not.toHaveBeenCalled();
    expect(store.vault.setAccountKeyMaterial).not.toHaveBeenCalled();
  });

  it("keeps the local data but stores the new wrap after a password change elsewhere", async () => {
    const keys = account();
    Object.assign(store, {
      accountKeyMaterial: {
        ...keys.userPasswordKeys,
        passwordKekSalt: toBase64(genKey()),
        email: "alice@example.com",
        userKeyPair: keys.userKeyPair,
      },
    });
    store.vault.getVaults.mockResolvedValue(keys.wraps);

    expect(await unlockWith(keys)).toBe(true);
    expect(store.vault.clear).not.toHaveBeenCalled();
    expect(store.vault.setAccountKeyMaterial).toHaveBeenCalledTimes(1);
  });

  it("stores a keypair the server rotated since the last unlock", async () => {
    const keys = account();
    Object.assign(store, {
      accountKeyMaterial: {
        ...keys.userPasswordKeys,
        email: "alice@example.com",
        userKeyPair: createUserKeyPair(genKey()),
      },
    });
    store.vault.getVaults.mockResolvedValue(keys.wraps);

    expect(await unlockWith(keys)).toBe(true);
    expect(store.vault.clear).not.toHaveBeenCalled();
    expect(store.vault.setAccountKeyMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ userKeyPair: keys.userKeyPair }),
      keys.wraps,
    );
  });

  it("stays locked when the keypair's public key isn't the one its private key proves", async () => {
    const keys = account();
    const swapped = { ...keys.userKeyPair, publicKey: createUserKeyPair(genKey()).publicKey };
    store.vault.getVaults.mockResolvedValue(keys.wraps);

    expect(await unlockWith({ ...keys, userKeyPair: swapped })).toBe(false);
    expect(secretsStore.isVaultUnlocked).toBe(false);
    expect(secretsStore.userPublicKey).toBeUndefined();
  });

  it("offline: unlocks with the keypair cached on the device", async () => {
    const keys = account();
    Object.assign(store, {
      accountKeyMaterial: {
        ...keys.userPasswordKeys,
        email: "alice@example.com",
        userKeyPair: keys.userKeyPair,
      },
    });
    store.vault.getVaults.mockResolvedValue(keys.wraps);

    const { result } = renderHook(() => useUnlock(), { wrapper });
    let unlocked = false;
    await act(async () => {
      unlocked = await result.current.offlineUnlock("alice@example.com", "pw");
    });

    expect(unlocked).toBe(true);
    expect(session.offlineLoginSession).toHaveBeenCalledTimes(1);
    expect(secretsStore.userPublicKey).toBe(keys.userKeyPair.publicKey);
    // Nothing changed, so nothing is rewritten.
    expect(store.vault.setAccountKeyMaterial).not.toHaveBeenCalled();
  });
});
