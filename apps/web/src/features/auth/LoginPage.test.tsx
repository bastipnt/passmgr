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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStoragePersistent } from "@/hooks/use-storage-persistent";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
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

const store = createFakeStore();

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
vi.mock("@/hooks/use-storage-persistent", () => ({ useStoragePersistent: vi.fn(() => true) }));
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
  linkServer: vi.fn(),
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

/** "Switch" from the active profile's unlock to the email login (if it shows). */
async function showLogin() {
  const switchButton = screen.queryByRole("button", { name: /^switch$/i });
  if (switchButton) await userEvent.click(switchButton);
}

async function login(email: string, password: string) {
  await showLogin();
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /^unlock vault$/i }));
}

/** The active profile's unlock: the password alone. */
async function unlockStored(password: string) {
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /^unlock vault$/i }));
}

function profileButton(name: RegExp) {
  return within(screen.getByRole("list", { name: /vaults on this device/i })).getByRole("button", {
    name,
  });
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

const localProfile = { profileId: "local-1", mode: "local", email: null, userId: null } as const;
const bobProfile: LocalProfile = {
  profileId: "profile-bob",
  mode: "linked",
  email: "bob@example.com",
  userId: "user-bob",
};

function resetMocks() {
  vi.clearAllMocks();
  vi.mocked(useStoragePersistent).mockReturnValue(true);
  secretsStore.lock();
  Object.assign(store, {
    profiles: [profileEntry(linkedProfile)],
    profile: linkedProfile,
    accountKeyMaterial,
    biometricKeyMaterial: null,
    needsBiometricEnroll: false,
  });
  store.vault.getVaults.mockResolvedValue([personalVault]);
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
    await unlockStored("wrong password");

    await screen.findByText(/check your email and password/i);
    expect(secretsStore.setPassword).not.toHaveBeenCalled();
    expect(loginUserCore).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Password")).toBeEnabled());
  });

  it("can't add an account the device has no profile for", async () => {
    renderPage();
    await login("mallory@example.com", "some password");

    await screen.findByText(/can't add an account offline/i);
    expect(argon2WorkerService.derive).not.toHaveBeenCalled();
    expect(store.openAccountProfile).not.toHaveBeenCalled();
    expect(unlockVault).not.toHaveBeenCalled();
  });

  it("unlocks the linked vault without the server and keeps the password for the reconnect", async () => {
    renderPage();
    await unlockStored("right password");

    await waitFor(() => expect(unlockVault).toHaveBeenCalledTimes(1));
    expect(unlockVault.mock.calls[0]?.[0]).toBe("linked");
    expect(secretsStore.setPassword).toHaveBeenCalledWith("right password");
    // No server: no login, and the key material isn't rewritten.
    expect(loginUserCore).not.toHaveBeenCalled();
    expect(store.saveAccount).not.toHaveBeenCalled();
    expect(screen.queryByText(/check your email and password/i)).not.toBeInTheDocument();
  });

  it("signs in by email to a profile on the device as if it was picked", async () => {
    store.profiles = [profileEntry(bobProfile), profileEntry(linkedProfile)];
    store.profile = bobProfile;
    renderPage();
    await login("Alice@Example.com", "right password");

    await waitFor(() => expect(unlockVault).toHaveBeenCalledTimes(1));
    expect(store.selectProfile).toHaveBeenCalledWith(linkedProfile.profileId);
    expect(store.profile?.profileId).toBe(linkedProfile.profileId);
    expect(loginUserCore).not.toHaveBeenCalled();
    expect(store.openAccountProfile).not.toHaveBeenCalled();
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
    // Same account, same profile: only its key material is refreshed.
    expect(store.saveAccount.mock.calls[0]?.[0]).toBe(linkedProfile.profileId);
    expect(store.saveAccount.mock.calls[0]?.[3]).toBeUndefined();
  });

  it("never attaches a session of another account to the unlocked vault", async () => {
    vi.mocked(loginUserCore).mockImplementation(serverLogin("user-someone-else"));
    renderPage({ networkOffline: false });
    await unlockStored("right password");

    await waitFor(() => expect(loginUserCore).toHaveBeenCalledTimes(1));
    expect(attachServer).not.toHaveBeenCalled();
    expect(secretsStore.hasServerSession).toBe(false);
    expect(store.saveAccount).not.toHaveBeenCalled();
    expect(store.openAccountProfile).not.toHaveBeenCalled();
  });

  it("gives the account the email now belongs to a profile of its own", async () => {
    unlockVault
      .mockImplementationOnce(() => {
        throw new Error("decrypt failed");
      })
      .mockImplementation(() => undefined);
    vi.mocked(loginUserCore).mockImplementation(serverLogin("user-someone-else"));
    renderPage({ networkOffline: false });
    await unlockStored("other account's password");

    await waitFor(() => expect(unlockVault).toHaveBeenCalledTimes(2));
    expect(store.profile?.userId).toBe("user-someone-else");
    // The profile that was picked stays on the device as it is.
    expect(store.profiles.map((p) => p.profileId)).toContain(linkedProfile.profileId);
    expect(store.removeProfile).not.toHaveBeenCalled();
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
    // The server's (newer) key material replaces the profile's local copy.
    expect(store.openAccountProfile).toHaveBeenCalledWith(
      { userId: linkedProfile.userId, email: "alice@example.com" },
      accountKeyMaterial,
      [personalVault],
    );
    expect(store.profile?.profileId).toBe(linkedProfile.profileId);
    expect(screen.queryByText(/check your email and password/i)).not.toBeInTheDocument();
  });
});

describe("LoginPage errors", () => {
  beforeEach(resetMocks);

  it("hides the error once the credentials are edited", async () => {
    renderPage();
    await login("mallory@example.com", "some password");
    await screen.findByText(/can't add an account offline/i);

    await userEvent.type(screen.getByLabelText("Password"), "x");
    expect(screen.queryByText(/can't add an account offline/i)).not.toBeInTheDocument();
  });

  it("hides the error when picking a profile", async () => {
    renderPage();
    await login("mallory@example.com", "some password");
    await screen.findByText(/can't add an account offline/i);

    await userEvent.click(profileButton(/alice@example.com/i));
    expect(screen.queryByText(/can't add an account offline/i)).not.toBeInTheDocument();
  });
});

describe("LoginPage online", () => {
  beforeEach(() => {
    resetMocks();
    vi.mocked(argon2WorkerService.derive).mockRejectedValue(new Error("worker crashed"));
    vi.mocked(loginUserCore).mockImplementation(serverLogin());
  });

  it("revokes the fresh server session when the vault can't be unlocked", async () => {
    store.profiles = [];
    store.profile = null;
    renderPage({ networkOffline: false });
    await login("alice@example.com", "right password");

    await screen.findByText(/check your email and password/i);
    expect(trpcClient.login.logout.mutate).toHaveBeenCalledTimes(1);
    expect(lock).toHaveBeenCalledTimes(1);
    expect(secretsStore.hasServerSession).toBe(false);
  });

  it("adds an account new to this device next to the profiles already there", async () => {
    vi.mocked(argon2WorkerService.derive).mockResolvedValue(new Uint8Array(32));
    vi.mocked(loginUserCore).mockImplementation(serverLogin("user-bob"));
    renderPage({ networkOffline: false });
    await login("bob@example.com", "right password");

    await waitFor(() => expect(unlockVault).toHaveBeenCalledTimes(1));
    expect(store.openAccountProfile.mock.calls[0]?.[0]).toEqual({
      userId: "user-bob",
      email: "alice@example.com",
    });
    expect(store.profiles.map((p) => p.userId)).toEqual(["user-alice", "user-bob"]);
    expect(store.removeProfile).not.toHaveBeenCalled();
  });

  it("keeps the throttle warning on edits, but drops it when picking a profile", async () => {
    vi.mocked(loginUserCore).mockRejectedValue(new LoginThrottledError());
    renderPage({ networkOffline: false });
    await login("mallory@example.com", "some password");
    await screen.findByText(/too many login attempts/i);

    await userEvent.type(screen.getByLabelText("Password"), "x");
    expect(screen.getByText(/too many login attempts/i)).toBeInTheDocument();

    await userEvent.click(profileButton(/alice@example.com/i));
    expect(screen.queryByText(/too many login attempts/i)).not.toBeInTheDocument();
  });
});

describe("LoginPage profiles", () => {
  beforeEach(() => {
    resetMocks();
    store.profiles = [
      profileEntry(linkedProfile),
      profileEntry(localProfile, "Travel"),
      profileEntry(bobProfile),
    ];
  });

  it("opens the active profile's unlock, and lists every profile after Switch", async () => {
    renderPage();
    expect(screen.queryByRole("list", { name: /vaults on this device/i })).not.toBeInTheDocument();

    await showLogin();
    expect(profileButton(/alice@example.com/i)).toBeInTheDocument();
    expect(profileButton(/travel/i)).toBeInTheDocument();
    expect(profileButton(/bob@example.com/i)).toBeInTheDocument();
  });

  it("shows no storage warning where the browser keeps the vaults", () => {
    renderPage();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("says vaults are lost on lock or reload when the browser refuses storage (private window)", () => {
    vi.mocked(useStoragePersistent).mockReturnValue(false);
    renderPage();
    expect(screen.getByRole("note")).toHaveTextContent(/gone once you lock, reload or close/i);
  });

  it("picking a profile opens its unlock", async () => {
    renderPage();
    await showLogin();
    await userEvent.click(profileButton(/travel/i));

    expect(store.selectProfile).toHaveBeenCalledWith(localProfile.profileId);
    expect(await screen.findByText("Travel")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).not.toBeVisible();
  });

  it("says so when a picked profile can't be opened, staying on the list", async () => {
    store.selectProfile.mockRejectedValueOnce(new Error("disk I/O error"));
    renderPage();
    await showLogin();
    await userEvent.click(profileButton(/travel/i));

    expect(await screen.findByText(/couldn.t be opened/i)).toBeInTheDocument();
    expect(profileButton(/travel/i)).toBeInTheDocument();
  });

  it("removes the active profile from its unlock card", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /remove vault from this device/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^remove vault$/i }));

    expect(store.removeProfile).toHaveBeenCalledWith(linkedProfile.profileId);
    expect(store.removeAllProfiles).not.toHaveBeenCalled();
  });

  it("removes every profile after a warning that names what is lost", async () => {
    store.countPendingChanges.mockResolvedValue(2);
    renderPage();
    await showLogin();
    await userEvent.click(screen.getByRole("button", { name: /remove all vaults/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/all 3 vaults/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/only copy/i)).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByText(/4 changes/i)).toBeInTheDocument());
    await userEvent.click(within(dialog).getByRole("button", { name: /^remove all$/i }));

    expect(store.removeAllProfiles).toHaveBeenCalledTimes(1);
  });
});

describe("LoginPage local vault", () => {
  beforeEach(() => {
    resetMocks();
    store.profiles = [profileEntry(localProfile)];
    store.profile = localProfile;
  });

  async function unlockLocalVault(password: string) {
    await userEvent.type(screen.getByLabelText("Password"), password);
    await userEvent.click(screen.getByRole("button", { name: /^unlock vault$/i }));
  }

  it("asks for the password only", () => {
    renderPage({ networkOffline: false });

    expect(screen.getByText("Vault on this device")).toBeInTheDocument();
    // Recovery stays on the device: no email, no server.
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
      "href",
      "/recover?vault=local",
    );
    expect(screen.getByLabelText("Email")).not.toBeVisible();
  });

  it("unlocks with the password alone and never talks to the server", async () => {
    renderPage({ networkOffline: false });
    await unlockLocalVault("right password");

    await waitFor(() => expect(unlockVault).toHaveBeenCalledTimes(1));
    expect(unlockVault.mock.calls[0]?.[0]).toBe("local");
    expect(loginUserCore).not.toHaveBeenCalled();
    expect(attachServer).not.toHaveBeenCalled();
    // Nothing to reconnect with: the password isn't kept.
    expect(secretsStore.setPassword).not.toHaveBeenCalled();
  });

  it("says the password is wrong without falling back to a server login", async () => {
    unlockVault.mockImplementation(() => {
      throw new Error("decrypt failed");
    });
    renderPage({ networkOffline: false });
    await unlockLocalVault("wrong password");

    await screen.findByText(/check your password and try again/i);
    expect(loginUserCore).not.toHaveBeenCalled();
  });

  it("rekeys stale Argon2 params on the device, without the server", async () => {
    // Stored with params other than the current ones (the derivation itself is mocked).
    const current = getPasswordKekParams();
    const stale = { ...accountKeyMaterial, passwordKekParams: { ...current, t: current.t + 1 } };
    store.accountKeyMaterial = stale;
    vi.spyOn(secretsStore, "rewrapAccountKey").mockReturnValue(["rewrapped", "nonce"]);
    renderPage({ networkOffline: false });
    await unlockLocalVault("right password");

    await waitFor(() => expect(store.saveAccount).toHaveBeenCalledTimes(1));
    const [profileId, saved, vaults, profile] = store.saveAccount.mock.calls[0] ?? [];
    expect(profileId).toBe(localProfile.profileId);
    expect(saved).toMatchObject({
      passwordKekParams: current,
      encryptedAccountKey: "rewrapped",
      userKeyPair: stale.userKeyPair,
    });
    expect(vaults).toEqual([personalVault]);
    expect(profile).toBeUndefined();
    // Unlock + rekey, both in the worker; no server involved.
    expect(argon2WorkerService.derive).toHaveBeenCalledTimes(2);
    expect(loginUserCore).not.toHaveBeenCalled();
  });

  it("keeps the typed password when the profile loads after the form", async () => {
    store.profile = null;
    const { rerender } = renderWithProviders(
      <SessionContext.Provider value={{ ...session, networkOffline: false }}>
        <LoginPage />
      </SessionContext.Provider>,
    );
    await userEvent.type(screen.getByLabelText("Password"), "right password");

    store.profile = localProfile;
    rerender(
      <SessionContext.Provider value={{ ...session, networkOffline: false }}>
        <LoginPage />
      </SessionContext.Provider>,
    );
    expect(screen.getByLabelText("Password")).toHaveValue("right password");
    // The local schema applies now: no email needed.
    await userEvent.click(screen.getByRole("button", { name: /^unlock vault$/i }));

    await waitFor(() => expect(unlockVault).toHaveBeenCalledTimes(1));
    expect(unlockVault.mock.calls[0]?.[0]).toBe("local");
  });
});
