import { SessionContext } from "@repo/client";
import {
  type ConnectResult,
  canReleasePassword,
  useConnectServer,
} from "@repo/client/src/hooks/use-connect-server";
import { useSessionRestore } from "@repo/client/src/hooks/use-session-restore";
import { useUnlock } from "@repo/client/src/hooks/use-unlock";
import {
  LoginStartFailedError,
  LoginThrottledError,
  loginUser as loginUserCore,
  OpaqueLoginFailedError,
} from "@repo/client/src/login";
import {
  createUserKeyPair,
  genKey,
  getPasswordKekParams,
  wrapAccountKey,
  wrapVaultKey,
} from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import type { MemberVault, UserKeyPair } from "@repo/schema";
import {
  clearLoginBundle,
  type LocalProfile,
  type LoginBundle,
  loadLoginBundle,
  type ProfileMode,
  persistLoginBundle,
  secretsStore,
} from "@repo/store";
import { toBase64 } from "@repo/util";
import { act, renderHook, waitFor } from "@testing-library/react";
import { TRPCClientError } from "@trpc/client";
import type { ContextType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";

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
  passwordKekParams: getPasswordKekParams(),
  passwordKekSalt: "salt",
  encryptedAccountKey: "enc",
  accountKeyEncryptionNonce: "nonce",
};

const ALICE: LocalProfile = {
  profileId: "profile-alice",
  mode: "linked",
  email: "alice@example.com",
  userId: "user-alice",
};
const BOB: LocalProfile = {
  profileId: "profile-bob",
  mode: "linked",
  email: "bob@example.com",
  userId: "user-bob",
};

const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));

const PERSONAL_ID = "0199a3c4-0000-7000-8000-00000000000a";
const B64_32 = toBase64(new Uint8Array(32));

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
  networkOffline: false,
  restoreLogin: vi.fn(
    (
      _mode: ProfileMode,
      bundle: LoginBundle,
      wraps: readonly MemberVault[],
      keyPair: UserKeyPair,
    ) => {
      secretsStore.restoreSession(bundle);
      loadKeyringOrLock(wraps, keyPair);
    },
  ),
  unlockWithAccountKey: vi.fn(
    (
      _mode: ProfileMode,
      accountKey: Uint8Array,
      wraps: readonly MemberVault[],
      keyPair: UserKeyPair,
    ) => {
      secretsStore.unlockWithAccountKey(accountKey);
      loadKeyringOrLock(wraps, keyPair);
    },
  ),
  unlockVault: vi.fn(
    (
      _mode: ProfileMode,
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
  lock: vi.fn(() => secretsStore.lock()),
  detachServer: vi.fn(() => secretsStore.detachServer()),
  attachServer: vi.fn(async (sessionId: string, sessionKey: string, salt: Uint8Array) => {
    await secretsStore.unlockSession(sessionId, sessionKey, salt);
  }),
} as unknown as ContextType<typeof SessionContext>;

function wrapper({ children }: { children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

function unauthorized() {
  return TRPCClientError.from({
    error: {
      code: -32001,
      message: "UNAUTHORIZED",
      data: { code: "UNAUTHORIZED", httpStatus: 401 },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  secretsStore.lock();
  Object.assign(store, {
    profiles: [profileEntry(ALICE)],
    profile: ALICE,
    accountKeyMaterial: null,
    biometricKeyMaterial: {},
    needsBiometricEnroll: false,
  });
  store.vault.getProfile.mockResolvedValue(ALICE);
  trpcClient.user.heartbeat.query.mockResolvedValue({ ok: true });
});

describe("useSessionRestore", () => {
  async function restore() {
    const { result } = renderHook(() => useSessionRestore(), { wrapper });
    await act(() => result.current.tryRestore());
    return result.current.status;
  }

  /** A bundle + the local key material it opens. */
  function persisted({ server = true } = {}) {
    const { accountKey, wraps, userKeyPair } = keyring();
    store.vault.getVaults.mockResolvedValue(wraps);
    store.accountKeyMaterial = { ...passwordKeys, userKeyPair };
    const bundle: LoginBundle = {
      accountKeyB64: toBase64(accountKey),
      ...(server && {
        server: { sessionId: "sid", authKeyB64: B64_32, authSaltB64: B64_32 },
      }),
    };
    vi.mocked(loadLoginBundle).mockResolvedValue(bundle);
    return { userKeyPair, wraps };
  }

  it("falls back to the password unlock for a bundle from an older app version", async () => {
    vi.mocked(loadLoginBundle).mockResolvedValue({
      sessionId: "sid",
      authKeyB64: B64_32,
      authSaltB64: B64_32,
      vaultKeyB64: B64_32,
    } as unknown as LoginBundle);

    expect(await restore()).toBe("needs-login");
    expect(clearLoginBundle).toHaveBeenCalledWith(ALICE.profileId);
    expect(trpcClient.user.heartbeat.query).not.toHaveBeenCalled();
    expect(secretsStore.hasServerSession).toBe(false);
  });

  it("restores the last used profile's bundle only", async () => {
    persisted();

    expect(await restore()).toBe("restored");
    expect(loadLoginBundle).toHaveBeenCalledWith(ALICE.profileId);
  });

  it("asks for the password without any profile on the device", async () => {
    persisted();
    Object.assign(store, { profiles: [], profile: null });

    expect(await restore()).toBe("needs-login");
    expect(loadLoginBundle).not.toHaveBeenCalled();
    expect(secretsStore.isVaultUnlocked).toBe(false);
  });

  it("waits for the profile list before restoring", async () => {
    persisted();
    store.loaded = false;
    try {
      const { result } = renderHook(() => useSessionRestore(), { wrapper });
      await act(() => result.current.tryRestore());
      expect(result.current.status).toBe("restoring");
      expect(loadLoginBundle).not.toHaveBeenCalled();
    } finally {
      store.loaded = true;
    }
  });

  it("falls back to the password unlock when the profile holds no key material", async () => {
    persisted();
    store.accountKeyMaterial = null;

    expect(await restore()).toBe("needs-login");
    expect(clearLoginBundle).toHaveBeenCalledWith(ALICE.profileId);
    expect(secretsStore.isVaultUnlocked).toBe(false);
  });

  it("falls back to the password unlock when the cached vault keys don't open", async () => {
    persisted();
    vi.mocked(loadLoginBundle).mockResolvedValue({
      accountKeyB64: toBase64(genKey()), // not the key the wraps were made with
      server: { sessionId: "sid", authKeyB64: B64_32, authSaltB64: B64_32 },
    });

    expect(await restore()).toBe("needs-login");
    expect(clearLoginBundle).toHaveBeenCalledTimes(1);
    expect(secretsStore.hasServerSession).toBe(false);
    expect(secretsStore.isVaultUnlocked).toBe(false);
  });

  it("falls back to the password unlock when the cached keypair isn't the user's", async () => {
    const { userKeyPair } = persisted();
    store.accountKeyMaterial = {
      ...passwordKeys,
      userKeyPair: { ...userKeyPair, publicKey: createUserKeyPair(genKey()).publicKey },
    };

    expect(await restore()).toBe("needs-login");
    expect(clearLoginBundle).toHaveBeenCalledTimes(1);
    expect(secretsStore.isVaultUnlocked).toBe(false);
    expect(secretsStore.userPublicKey).toBeUndefined();
  });

  it("restores the vault and the server session, then checks the session", async () => {
    const { userKeyPair } = persisted();

    expect(await restore()).toBe("restored");
    expect(clearLoginBundle).not.toHaveBeenCalled();
    expect(secretsStore.isVaultUnlocked).toBe(true);
    expect(secretsStore.userPublicKey).toBe(userKeyPair.publicKey);
    expect(vi.mocked(session.restoreLogin).mock.calls[0]?.[0]).toBe("linked");
    expect(trpcClient.user.heartbeat.query).toHaveBeenCalledTimes(1);
    expect(secretsStore.hasServerSession).toBe(true);
  });

  it("goes offline, not to the login, when the server rejects the session", async () => {
    persisted();
    trpcClient.user.heartbeat.query.mockRejectedValue(unauthorized());

    expect(await restore()).toBe("restored");
    expect(session.detachServer).toHaveBeenCalledTimes(1);
    expect(secretsStore.isVaultUnlocked).toBe(true);
    expect(secretsStore.hasServerSession).toBe(false);
    // The dead session isn't restored again next time.
    expect(persistLoginBundle).toHaveBeenCalledWith(ALICE.profileId, {
      accountKeyB64: expect.any(String),
    });
  });

  it("keeps the session on a network error", async () => {
    persisted();
    trpcClient.user.heartbeat.query.mockRejectedValue(new TypeError("Network request failed"));

    expect(await restore()).toBe("restored");
    expect(session.detachServer).not.toHaveBeenCalled();
    expect(secretsStore.hasServerSession).toBe(true);
  });

  it("restores a bundle without a server session without asking the server", async () => {
    persisted({ server: false });

    expect(await restore()).toBe("restored");
    expect(trpcClient.user.heartbeat.query).not.toHaveBeenCalled();
    expect(secretsStore.isVaultUnlocked).toBe(true);
  });
});

describe("biometricUnlock", () => {
  it("fails without touching the server when the vault keys don't open", async () => {
    const { authenticateBiometric } = await import("@repo/crypto");
    const { wraps, userKeyPair } = keyring();
    vi.mocked(authenticateBiometric).mockResolvedValue({
      accountKey: genKey(), // not the key the wraps were made with
      password: "right password",
    });
    store.accountKeyMaterial = { ...passwordKeys, userKeyPair };
    store.vault.getVaults.mockResolvedValue(wraps);

    const { result } = renderHook(() => useUnlock(), { wrapper });
    await act(async () => {
      await expect(result.current.biometricUnlock()).rejects.toThrow();
    });

    expect(loginUserCore).not.toHaveBeenCalled();
    expect(secretsStore.isVaultUnlocked).toBe(false);
    await waitFor(() => expect(result.current.unlockError).toBe("failed"));
  });

  it("unlocks locally, then attaches the server session", async () => {
    const { authenticateBiometric } = await import("@repo/crypto");
    const { accountKey, wraps, userKeyPair } = keyring();
    vi.mocked(authenticateBiometric).mockResolvedValue({ accountKey, password: "pw" });
    store.accountKeyMaterial = { ...passwordKeys, userKeyPair };
    store.vault.getVaults.mockResolvedValue(wraps);
    vi.mocked(loginUserCore).mockImplementation(async (_trpc, attach) => {
      await attach("live-session", "session-key", new Uint8Array(32));
      return {
        email: "alice@example.com",
        userId: ALICE.userId,
        password: "pw",
        userPasswordKeys: passwordKeys,
        vaultKeys: wraps,
        userKeyPair,
      };
    });

    const { result } = renderHook(() => useUnlock(), { wrapper });
    await act(() => result.current.biometricUnlock());

    expect(secretsStore.isVaultUnlocked).toBe(true);
    await waitFor(() => expect(secretsStore.hasServerSession).toBe(true));
    expect(store.saveAccount).toHaveBeenCalledTimes(1);
  });
});

describe("useConnectServer", () => {
  /** An unlocked linked vault and a server login that hands out `userId`'s keys. */
  function unlockedVault({ userId = "user-alice" }: { userId?: string } = {}) {
    const { accountKey, wraps, userKeyPair } = keyring();
    secretsStore.unlockWithAccountKey(accountKey);
    secretsStore.loadVaultKeys(wraps);
    store.vault.getVaults.mockResolvedValue(wraps);
    vi.mocked(loginUserCore).mockImplementation(async (_trpc, attach) => {
      await attach("live-session", "session-key", new Uint8Array(32));
      return {
        email: "alice@example.com",
        userId,
        password: "pw",
        userPasswordKeys: passwordKeys,
        vaultKeys: wraps,
        userKeyPair,
      };
    });
  }

  function renderConnect() {
    return renderHook(() => useConnectServer(), { wrapper }).result;
  }

  async function connectOnce(password = "pw") {
    const result = renderConnect();
    let outcome: ConnectResult | undefined;
    await act(async () => {
      outcome = await result.current.connect(password);
    });
    return outcome;
  }

  it("attaches the session after storing the account's key material", async () => {
    unlockedVault();

    expect(await connectOnce()).toBe("online");
    expect(store.saveAccount).toHaveBeenCalledTimes(1);
    expect(store.saveAccount.mock.calls[0]?.[0]).toBe(ALICE.profileId);
    expect(session.attachServer).toHaveBeenCalledTimes(1);
    expect(vi.mocked(store.saveAccount).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(session.attachServer).mock.invocationCallOrder[0] ?? 0,
    );
    expect(secretsStore.hasServerSession).toBe(true);
  });

  it("runs one OPAQUE login when the unlock and the auto-reconnect both connect", async () => {
    unlockedVault();
    const { result } = renderHook(
      () => ({ unlock: useConnectServer(), reconnect: useConnectServer() }),
      { wrapper },
    );
    let outcomes: ConnectResult[] = [];
    await act(async () => {
      outcomes = await Promise.all([
        result.current.unlock.connect("pw"),
        result.current.reconnect.connect("pw"),
      ]);
    });

    expect(outcomes).toEqual(["online", "online"]);
    expect(loginUserCore).toHaveBeenCalledTimes(1);
  });

  it("never attaches a session of another account, so nothing syncs with it", async () => {
    unlockedVault({ userId: "user-alice-reregistered" });

    expect(await connectOnce()).toBe("rejected");
    expect(session.attachServer).not.toHaveBeenCalled();
    expect(secretsStore.hasServerSession).toBe(false);
    expect(store.saveAccount).not.toHaveBeenCalled();
  });

  it("attaches nothing without a linked profile", async () => {
    unlockedVault();
    store.profile = { profileId: "p-local", mode: "local", email: null, userId: null };

    expect(await connectOnce()).toBe("cancelled");
    expect(loginUserCore).not.toHaveBeenCalled();
  });

  it("attaches nothing when the vault was locked while the login ran", async () => {
    unlockedVault();
    const login = vi.mocked(loginUserCore).getMockImplementation()!;
    vi.mocked(loginUserCore).mockImplementation(async (...args) => {
      const info = await login(...args);
      secretsStore.lock(); // the user locks (or signs out) mid-connect
      return info;
    });

    expect(await connectOnce()).toBe("cancelled");
    expect(session.attachServer).not.toHaveBeenCalled();
    expect(secretsStore.hasServerSession).toBe(false);
    expect(store.saveAccount).not.toHaveBeenCalled();
  });

  it("doesn't hand a connect from before a lock to the next unlock", async () => {
    unlockedVault();
    let release!: () => void;
    const login = vi.mocked(loginUserCore).getMockImplementation()!;
    vi.mocked(loginUserCore).mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return await login(...args);
    });
    const result = renderConnect();

    let stale: Promise<ConnectResult> | undefined;
    act(() => {
      stale = result.current.connect("pw");
    });
    secretsStore.lock();
    unlockedVault();
    let fresh: ConnectResult | undefined;
    await act(async () => {
      const next = result.current.connect("pw");
      release();
      fresh = await next;
    });

    expect(await stale).toBe("cancelled");
    expect(fresh).toBe("online");
    expect(loginUserCore).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["rejected", new OpaqueLoginFailedError()],
    ["throttled", new LoginThrottledError()],
    ["unreachable", new LoginStartFailedError()],
  ] as const)("reports %s for a failed login", async (expected, error) => {
    unlockedVault();
    vi.mocked(loginUserCore).mockRejectedValue(error);

    expect(await connectOnce()).toBe(expected);
    expect(session.attachServer).not.toHaveBeenCalled();
  });

  it.each([
    ["online", false, true],
    ["rejected", false, true],
    ["online", true, false],
    ["throttled", false, false],
    ["unreachable", false, false],
    ["cancelled", false, false],
  ] as const)(
    "a %s connect (enrollment pending: %s) releases the password: %s",
    (result, enroll, release) => {
      expect(canReleasePassword(result, enroll)).toBe(release);
    },
  );
});

describe("unlock: which profile?", () => {
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

  async function unlockWith(keys: ReturnType<typeof account>, userId = "user-alice") {
    const { result } = renderHook(() => useUnlock(), { wrapper });
    let unlocked = false;
    await act(async () => {
      unlocked = await result.current.unlock({
        email: "Alice@Example.com",
        userId,
        password: "pw",
        userPasswordKeys: keys.userPasswordKeys,
        vaultKeys: keys.wraps,
        userKeyPair: keys.userKeyPair,
      });
    });
    return { unlocked, error: result.current.unlockError };
  }

  it("adds a profile for an account new to this device", async () => {
    const keys = account();
    Object.assign(store, { profiles: [], profile: null });

    expect((await unlockWith(keys)).unlocked).toBe(true);
    expect(store.openAccountProfile).toHaveBeenCalledWith(
      { userId: ALICE.userId, email: "alice@example.com" },
      { ...keys.userPasswordKeys, userKeyPair: keys.userKeyPair },
      keys.wraps,
    );
    expect(store.profiles).toHaveLength(1);
    expect(secretsStore.isVaultUnlocked).toBe(true);
  });

  it("opens the account's own profile, leaving the active one's data alone", async () => {
    const keys = account();
    store.profiles = [profileEntry(ALICE), profileEntry(BOB)];
    store.profile = BOB;

    expect((await unlockWith(keys)).unlocked).toBe(true);
    expect(store.profile?.profileId).toBe(ALICE.profileId);
    expect(store.profiles).toHaveLength(2);
    expect(store.removeProfile).not.toHaveBeenCalled();
  });

  it("gives an email that now belongs to another account a profile of its own", async () => {
    const keys = account();

    expect((await unlockWith(keys, "user-alice-reregistered")).unlocked).toBe(true);
    expect(store.profile?.profileId).not.toBe(ALICE.profileId);
    expect(store.profiles.map((p) => p.userId)).toEqual([ALICE.userId, "user-alice-reregistered"]);
  });

  it("adds an account next to a vault without one", async () => {
    const keys = account();
    const local = { profileId: "p-local", mode: "local", email: null, userId: null } as const;
    Object.assign(store, { profiles: [profileEntry(local)], profile: local });

    expect((await unlockWith(keys)).unlocked).toBe(true);
    expect(store.profiles.map((p) => p.mode)).toEqual(["local", "linked"]);
    expect(store.removeProfile).not.toHaveBeenCalled();
  });

  it("revokes the session when the profile can't be opened", async () => {
    const keys = account();
    store.openAccountProfile.mockRejectedValueOnce(new Error("disk full"));
    await secretsStore.unlockSession("live-session", "k", genKey());

    const { unlocked, error } = await unlockWith(keys);
    expect(unlocked).toBe(false);
    expect(error).toBe("failed");
    expect(trpcClient.login.logout.mutate).toHaveBeenCalledTimes(1);
    expect(secretsStore.hasServerSession).toBe(false);
  });

  it("stays locked when the keypair's public key isn't the one its private key proves", async () => {
    const keys = account();
    const swapped = { ...keys.userKeyPair, publicKey: createUserKeyPair(genKey()).publicKey };

    expect((await unlockWith({ ...keys, userKeyPair: swapped })).unlocked).toBe(false);
    expect(secretsStore.isVaultUnlocked).toBe(false);
    expect(secretsStore.userPublicKey).toBeUndefined();
  });

  it("offline: unlocks with the keypair cached on the device, without the server", async () => {
    const keys = account();
    store.accountKeyMaterial = { ...keys.userPasswordKeys, userKeyPair: keys.userKeyPair };
    store.vault.getVaults.mockResolvedValue(keys.wraps);
    const offline = { ...session, networkOffline: true };

    const { result } = renderHook(() => useUnlock(), {
      wrapper: ({ children }) => (
        <SessionContext.Provider value={offline}>{children}</SessionContext.Provider>
      ),
    });
    let unlocked: boolean | undefined;
    await act(async () => {
      unlocked = await result.current.unlockByEmail("Alice@example.com", "pw");
    });

    expect(unlocked).toBe(true);
    expect(vi.mocked(session.unlockVault).mock.calls[0]?.[0]).toBe("linked");
    expect(secretsStore.userPublicKey).toBe(keys.userKeyPair.publicKey);
    expect(loginUserCore).not.toHaveBeenCalled();
    // Nothing changed, so nothing is rewritten.
    expect(store.saveAccount).not.toHaveBeenCalled();
  });

  it("offline: can't add an account the device has no profile for", async () => {
    const offline = { ...session, networkOffline: true };
    const { result } = renderHook(() => useUnlock(), {
      wrapper: ({ children }) => (
        <SessionContext.Provider value={offline}>{children}</SessionContext.Provider>
      ),
    });
    let unlocked: boolean | undefined;
    await act(async () => {
      unlocked = await result.current.unlockByEmail("bob@example.com", "pw");
    });

    expect(unlocked).toBe(false);
    expect(result.current.unlockError).toBe("wrong_account");
    expect(store.selectProfile).not.toHaveBeenCalled();
    expect(argon2WorkerService.derive).not.toHaveBeenCalled();
  });

  it("online: leaves an account new to this device to the server login", async () => {
    const { result } = renderHook(() => useUnlock(), { wrapper });
    let unlocked: boolean | undefined = false;
    await act(async () => {
      unlocked = await result.current.unlockByEmail("bob@example.com", "pw");
    });

    expect(unlocked).toBeUndefined();
    expect(result.current.unlockError).toBeUndefined();
  });
});
