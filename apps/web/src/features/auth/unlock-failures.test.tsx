import { SessionContext } from "@repo/client";
import { useSessionRestore } from "@repo/client/src/hooks/use-session-restore";
import { useUnlock } from "@repo/client/src/hooks/use-unlock";
import { loginUser as loginUserCore } from "@repo/client/src/login";
import { genKey, wrapVaultKey } from "@repo/crypto";
import type { MemberVaultKey } from "@repo/schema";
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
  vault: { getVaultKeys: vi.fn(), setAccountKeyMaterial: vi.fn(), clear: vi.fn() },
  accountKeyMaterial: { ...passwordKeys, email: "alice@example.com" },
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
  const wraps: MemberVaultKey[] = [
    { ...wrapVaultKey(accountKey, genKey(), PERSONAL_ID, 1), kind: "personal" },
  ];
  return { accountKey, wraps };
}

const B64_32 = toBase64(new Uint8Array(32));

/** Mirrors SessionProvider: restoring a login loads the vault keys, which may throw. */
const session = {
  restoreLogin: vi.fn((bundle: Omit<LoginBundle, "email">, wraps: readonly MemberVaultKey[]) => {
    secretsStore.restoreSession(bundle);
    secretsStore.loadVaultKeys(wraps);
  }),
  unlockWithAccountKey: vi.fn((accountKey: Uint8Array, wraps: readonly MemberVaultKey[]) => {
    secretsStore.unlockWithAccountKey(accountKey);
    secretsStore.loadVaultKeys(wraps);
  }),
  endSession: vi.fn(),
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
    const { wraps } = keyring();
    vi.mocked(loadLoginBundle).mockResolvedValue({
      sessionId: "sid",
      authKeyB64: B64_32,
      authSaltB64: B64_32,
      accountKeyB64: toBase64(genKey()), // not the key the wraps were made with
      email: "alice@example.com",
    });
    store.vault.getVaultKeys.mockResolvedValue(wraps);

    expect(await restore()).toBe("needs-login");
    expect(clearLoginBundle).toHaveBeenCalledTimes(1);
    expect(secretsStore.sessionId).toBeUndefined();
    expect(secretsStore.isVaultUnlocked).toBe(false);
  });

  it("restores a valid bundle with the cached vault keys", async () => {
    const { accountKey, wraps } = keyring();
    vi.mocked(loadLoginBundle).mockResolvedValue({
      sessionId: "sid",
      authKeyB64: B64_32,
      authSaltB64: B64_32,
      accountKeyB64: toBase64(accountKey),
      email: "alice@example.com",
    });
    store.vault.getVaultKeys.mockResolvedValue(wraps);

    expect(await restore()).toBe("restored");
    expect(clearLoginBundle).not.toHaveBeenCalled();
    expect(secretsStore.isVaultUnlocked).toBe(true);
  });
});

describe("biometricUnlock failure path", () => {
  it("revokes the fresh server session when the vault keys don't open", async () => {
    const { authenticateBiometric } = await import("@repo/crypto");
    const { wraps } = keyring();
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
      };
    });
    store.vault.getVaultKeys.mockResolvedValue(wraps);

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
