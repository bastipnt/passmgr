import { SessionContext } from "@repo/client";
import {
  type LoginSessionFn,
  LoginThrottledError,
  loginUser as loginUserCore,
} from "@repo/client/src/login";
import { getPasswordKekParams } from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import type { MemberVault } from "@repo/schema";
import { type LocalProfile, secretsStore } from "@repo/store";
import userEvent from "@testing-library/user-event";
import type { ContextType } from "react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import LoginPage from "./LoginPage";

// Real `useUnlock` / `useLogin`; only the layers below them are replaced.
const personalVault: MemberVault = {
  vaultId: "0199a3c4-0000-7000-8000-00000000000a",
  kind: "personal",
  keyVersion: 1,
  role: "owner",
  encryptedVaultKey: "AAAA",
  vaultKeyEncryptionNonce: "AAAA",
  encryptedMeta: "AAAA",
  metaEncryptionNonce: "AAAA",
};

const linkedProfile = {
  profileId: "profile-1",
  mode: "linked",
  email: "alice@example.com",
  userId: "user-alice",
} as const;

const accountKeyMaterial = {
  passwordKekParams: getPasswordKekParams(),
  passwordKekSalt: "AAAAAAAAAAAAAAAAAAAAAA==",
  encryptedAccountKey: "AAAA",
  accountKeyEncryptionNonce: "AAAA",
  userKeyPair: {
    keyVersion: 1,
    publicKey: "AAAA",
    encryptedPrivateKey: "AAAA",
    privateKeyEncryptionNonce: "AAAA",
  },
};

const store: {
  profile: LocalProfile | null;
  [key: string]: unknown;
  vault: { getVaults: Mock; clear: Mock };
  saveAccount: Mock;
} = {
  profile: linkedProfile,
  accountKeyMaterial,
  biometricKeyMaterial: null,
  needsBiometricEnroll: false,
  vault: {
    getVaults: vi.fn(async () => [personalVault]),
    clear: vi.fn(),
  },
  saveAccount: vi.fn(),
  removeVault: vi.fn(),
};

vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
const trpcClient = { login: { logout: { mutate: vi.fn() } } };
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => trpcClient,
}));
// The OPAQUE handshake itself; `useLogin` around it stays real.
vi.mock("@repo/client/src/login", async (importActual) => ({
  ...(await importActual<object>()),
  loginUser: vi.fn(),
}));
vi.mock("@repo/client/src/hooks/use-app-config", () => ({
  useAppConfig: () => ({ registrationEnabled: true, isLoading: false }),
}));
vi.mock("@repo/crypto/services/argon2-worker-service", () => ({
  argon2WorkerService: { derive: vi.fn() },
}));
vi.mock("@repo/crypto/services/decrypt-worker-service", () => ({
  decryptWorkerService: { init: vi.fn() },
}));

const unlockVault = vi.fn();
const attachServer = vi.fn(async (sessionId: string, sessionKey: string, salt: Uint8Array) => {
  await secretsStore.unlockSession(sessionId, sessionKey, salt);
});
const detachServer = vi.fn();
const lock = vi.fn(() => secretsStore.lock());

const session: ContextType<typeof SessionContext> = {
  vaultUnlocked: false,
  networkOffline: true,
  attachServer,
  detachServer,
  restoreLogin: vi.fn(),
  unlockVault,
  unlockWithAccountKey: vi.fn(),
  signRequest: vi.fn(),
  lock,
};

function renderPage({ networkOffline = true } = {}) {
  renderWithProviders(
    <SessionContext.Provider value={{ ...session, networkOffline }}>
      <LoginPage />
    </SessionContext.Provider>,
  );
}

async function login(email: string, password: string) {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /^unlock vault$/i }));
}

/** Pick this device's vault, then unlock it with the password alone. */
async function unlockStored(password: string) {
  await userEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /^unlock vault$/i }));
}

/** What the server hands back after OPAQUE, with the server session attached. */
function serverLogin(userId: string = linkedProfile.userId) {
  return async (_trpc: unknown, attach: LoginSessionFn) => {
    await attach("live-session", "session-key", new Uint8Array(32));
    return {
      email: "alice@example.com",
      userId,
      password: "right password",
      userPasswordKeys: accountKeyMaterial,
      vaultKeys: [personalVault],
      userKeyPair: accountKeyMaterial.userKeyPair,
    };
  };
}

function resetMocks() {
  vi.clearAllMocks();
  secretsStore.lock();
  store.profile = linkedProfile;
  unlockVault.mockReset();
  vi.mocked(argon2WorkerService.derive).mockResolvedValue(new Uint8Array(32));
  vi.spyOn(secretsStore, "setPassword");
  // `unlockVault` is a mock: let the background connect see an unlocked vault.
  vi.spyOn(secretsStore, "isVaultUnlocked", "get").mockReturnValue(true);
  vi.spyOn(secretsStore, "exportVaultKeysForWorker").mockReturnValue(new Map());
}

describe("LoginPage offline", () => {
  beforeEach(resetMocks);

  it("keeps no password when the password is wrong", async () => {
    unlockVault.mockImplementation(() => {
      throw new Error("decrypt failed");
    });
    renderPage();
    await login("alice@example.com", "wrong password");

    await screen.findByText(/check your email and password/i);
    expect(secretsStore.setPassword).not.toHaveBeenCalled();
    expect(loginUserCore).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Password")).toBeEnabled());
  });

  it("rejects another account's email before touching the local vault", async () => {
    renderPage();
    await login("mallory@example.com", "some password");

    await screen.findByText(/can't switch accounts offline/i);
    expect(argon2WorkerService.derive).not.toHaveBeenCalled();
    expect(store.vault.clear).not.toHaveBeenCalled();
    expect(store.saveAccount).not.toHaveBeenCalled();
    expect(unlockVault).not.toHaveBeenCalled();
  });

  it("unlocks the linked vault without the server and keeps the password for the reconnect", async () => {
    renderPage();
    await login("alice@example.com", "right password");

    await waitFor(() => expect(unlockVault).toHaveBeenCalledTimes(1));
    expect(unlockVault.mock.calls[0]?.[0]).toBe("linked");
    expect(secretsStore.setPassword).toHaveBeenCalledWith("right password");
    // No server: no login, and the key material isn't rewritten.
    expect(loginUserCore).not.toHaveBeenCalled();
    expect(store.saveAccount).not.toHaveBeenCalled();
    expect(screen.queryByText(/check your email and password/i)).not.toBeInTheDocument();
  });
});

describe("LoginPage stored vault", () => {
  beforeEach(resetMocks);

  it("unlocks locally first, then attaches the server session in the background", async () => {
    vi.mocked(loginUserCore).mockImplementation(serverLogin());
    renderPage({ networkOffline: false });
    await unlockStored("right password");

    await waitFor(() => expect(store.saveAccount).toHaveBeenCalledTimes(1));
    expect(unlockVault.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(loginUserCore).mock.invocationCallOrder[0] ?? 0,
    );
    expect(vi.mocked(loginUserCore).mock.calls[0]?.[2]).toBe("alice@example.com");
    // Same account: the local data stays, the profile isn't replaced.
    expect(store.vault.clear).not.toHaveBeenCalled();
    expect(store.saveAccount.mock.calls[0]?.[2]).toBeUndefined();
  });

  it("never attaches a session of another account to the unlocked vault", async () => {
    vi.mocked(loginUserCore).mockImplementation(serverLogin("user-someone-else"));
    renderPage({ networkOffline: false });
    await unlockStored("right password");

    await waitFor(() => expect(loginUserCore).toHaveBeenCalledTimes(1));
    expect(attachServer).not.toHaveBeenCalled();
    expect(secretsStore.hasServerSession).toBe(false);
    expect(store.saveAccount).not.toHaveBeenCalled();
    expect(store.vault.clear).not.toHaveBeenCalled();
  });

  it("doesn't switch accounts when the fallback login finds another account", async () => {
    unlockVault.mockImplementation(() => {
      throw new Error("decrypt failed");
    });
    vi.mocked(loginUserCore).mockImplementation(serverLogin("user-someone-else"));
    renderPage({ networkOffline: false });
    await unlockStored("other account's password");

    await screen.findByText(/this email now belongs to another account/i);
    expect(store.vault.clear).not.toHaveBeenCalled();
    expect(store.saveAccount).not.toHaveBeenCalled();
    // The login's session is revoked again.
    expect(trpcClient.login.logout.mutate).toHaveBeenCalledTimes(1);
    expect(secretsStore.hasServerSession).toBe(false);
  });

  it("falls back to the server login when the password doesn't open the local copy", async () => {
    unlockVault
      .mockImplementationOnce(() => {
        throw new Error("decrypt failed: password changed on another device");
      })
      .mockImplementation(() => undefined);
    vi.mocked(loginUserCore).mockImplementation(serverLogin());
    renderPage({ networkOffline: false });
    await unlockStored("new password");

    await waitFor(() => expect(unlockVault).toHaveBeenCalledTimes(2));
    // The server's (newer) key material replaces the local copy.
    expect(store.saveAccount).toHaveBeenCalledWith(accountKeyMaterial, [personalVault], undefined);
    expect(screen.queryByText(/check your email and password/i)).not.toBeInTheDocument();
  });
});

describe("LoginPage errors", () => {
  beforeEach(resetMocks);

  it("hides the error once the credentials are edited", async () => {
    renderPage();
    await login("mallory@example.com", "some password");
    await screen.findByText(/can't switch accounts offline/i);

    await userEvent.type(screen.getByLabelText("Password"), "x");
    expect(screen.queryByText(/can't switch accounts offline/i)).not.toBeInTheDocument();
  });

  it("hides the error when switching to the stored account", async () => {
    renderPage();
    await login("mallory@example.com", "some password");
    await screen.findByText(/can't switch accounts offline/i);

    await userEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));
    expect(screen.queryByText(/can't switch accounts offline/i)).not.toBeInTheDocument();
  });
});

describe("LoginPage online", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(argon2WorkerService.derive).mockRejectedValue(new Error("worker crashed"));
    vi.mocked(loginUserCore).mockImplementation(serverLogin());
  });

  it("revokes the fresh server session when the vault can't be unlocked", async () => {
    renderPage({ networkOffline: false });
    await login("alice@example.com", "right password");

    await screen.findByText(/check your email and password/i);
    expect(trpcClient.login.logout.mutate).toHaveBeenCalledTimes(1);
    expect(lock).toHaveBeenCalledTimes(1);
    expect(secretsStore.hasServerSession).toBe(false);
  });

  it("signs another account in by clearing the previous account's local data", async () => {
    vi.mocked(argon2WorkerService.derive).mockResolvedValue(new Uint8Array(32));
    vi.mocked(loginUserCore).mockImplementation(serverLogin("user-bob"));
    renderPage({ networkOffline: false });
    await login("bob@example.com", "right password");

    await waitFor(() => expect(unlockVault).toHaveBeenCalledTimes(1));
    expect(store.vault.clear).toHaveBeenCalledTimes(1);
    expect(store.saveAccount.mock.calls[0]?.[2]).toMatchObject({
      mode: "linked",
      email: "alice@example.com",
      userId: "user-bob",
    });
    expect(store.saveAccount.mock.calls[0]?.[2].profileId).not.toBe(linkedProfile.profileId);
  });

  it("never replaces a vault without an account", async () => {
    vi.mocked(argon2WorkerService.derive).mockResolvedValue(new Uint8Array(32));
    store.profile = { profileId: "local-1", mode: "local", email: null, userId: null };
    renderPage({ networkOffline: false });
    await login("alice@example.com", "right password");

    await screen.findByText(/vault without an account/i);
    expect(store.vault.clear).not.toHaveBeenCalled();
    expect(store.saveAccount).not.toHaveBeenCalled();
    expect(unlockVault).not.toHaveBeenCalled();
    expect(trpcClient.login.logout.mutate).toHaveBeenCalledTimes(1);
  });

  it("keeps the throttle warning on edits, but drops it for the stored account", async () => {
    vi.mocked(loginUserCore).mockRejectedValue(new LoginThrottledError());
    renderPage({ networkOffline: false });
    await login("mallory@example.com", "some password");
    await screen.findByText(/too many login attempts/i);

    await userEvent.type(screen.getByLabelText("Password"), "x");
    expect(screen.getByText(/too many login attempts/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));
    expect(screen.queryByText(/too many login attempts/i)).not.toBeInTheDocument();
  });
});
