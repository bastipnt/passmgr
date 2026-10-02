import { SessionContext } from "@repo/client";
import { LoginThrottledError, loginUser as loginUserCore } from "@repo/client/src/login";
import { getPasswordKekParams } from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import type { MemberVaultKey } from "@repo/schema";
import { secretsStore } from "@repo/store";
import userEvent from "@testing-library/user-event";
import type { ContextType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import LoginPage from "./LoginPage";

// Real `useUnlock` / `useLogin`; only the layers below them are replaced.
const personalVault: MemberVaultKey = {
  vaultId: "0199a3c4-0000-7000-8000-00000000000a",
  kind: "personal",
  keyVersion: 1,
  encryptedVaultKey: "AAAA",
  vaultKeyEncryptionNonce: "AAAA",
};

const store = {
  accountKeyMaterial: {
    email: "alice@example.com",
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
  },
  biometricKeyMaterial: null,
  needsBiometricEnroll: false,
  vault: {
    setAccountKeyMaterial: vi.fn(),
    getVaultKeys: vi.fn(async () => [personalVault]),
    clear: vi.fn(),
  },
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

const session: ContextType<typeof SessionContext> = {
  vaultUnlocked: false,
  loggedIn: false,
  isOffline: true,
  loginSession: vi.fn(),
  restoreLogin: vi.fn(),
  offlineLoginSession: vi.fn(),
  unlockVault: vi.fn(),
  unlockWithAccountKey: vi.fn(),
  signRequest: vi.fn(),
  endSession: vi.fn(),
};

function renderPage({ isOffline = true } = {}) {
  renderWithProviders(
    <SessionContext.Provider value={{ ...session, isOffline }}>
      <LoginPage />
    </SessionContext.Provider>,
  );
}

async function login(email: string, password: string) {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /^unlock vault$/i }));
}

describe("LoginPage offline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(session.unlockVault).mockReset();
    vi.mocked(argon2WorkerService.derive).mockResolvedValue(new Uint8Array(32));
    vi.spyOn(secretsStore, "setPassword");
    vi.spyOn(secretsStore, "exportVaultKeyForWorker").mockReturnValue(new Uint8Array(32));
  });

  it("commits no offline session or password when the password is wrong", async () => {
    vi.mocked(session.unlockVault).mockImplementation(() => {
      throw new Error("decrypt failed");
    });
    renderPage();
    await login("alice@example.com", "wrong password");

    await screen.findByText(/check your email and password/i);
    expect(session.offlineLoginSession).not.toHaveBeenCalled();
    expect(secretsStore.setPassword).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Password")).toBeEnabled());
  });

  it("rejects another account's email before touching the local vault", async () => {
    renderPage();
    await login("mallory@example.com", "some password");

    await screen.findByText(/can't switch accounts offline/i);
    expect(argon2WorkerService.derive).not.toHaveBeenCalled();
    expect(store.vault.clear).not.toHaveBeenCalled();
    expect(store.vault.setAccountKeyMaterial).not.toHaveBeenCalled();
    expect(session.offlineLoginSession).not.toHaveBeenCalled();
  });

  it("starts the offline session and keeps the password once the vault unlocks", async () => {
    renderPage();
    await login("alice@example.com", "right password");

    await waitFor(() => expect(session.offlineLoginSession).toHaveBeenCalledTimes(1));
    expect(session.unlockVault).toHaveBeenCalled();
    expect(secretsStore.setPassword).toHaveBeenCalledWith("right password");
    // Unchanged key material isn't rewritten.
    expect(store.vault.setAccountKeyMaterial).not.toHaveBeenCalled();
    expect(screen.queryByText(/check your email and password/i)).not.toBeInTheDocument();
  });
});

describe("LoginPage errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(session.unlockVault).mockReset();
  });

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
    vi.clearAllMocks();
    vi.mocked(session.unlockVault).mockReset();
    vi.mocked(argon2WorkerService.derive).mockRejectedValue(new Error("worker crashed"));
    vi.mocked(loginUserCore).mockImplementation(async () => {
      secretsStore.sessionId = "live-session";
      return {
        email: "alice@example.com",
        password: "right password",
        userPasswordKeys: store.accountKeyMaterial,
        vaultKeys: [personalVault],
        userKeyPair: store.accountKeyMaterial.userKeyPair,
      };
    });
  });

  it("revokes the fresh server session when the vault can't be unlocked", async () => {
    renderPage({ isOffline: false });
    await login("alice@example.com", "right password");

    await screen.findByText(/check your email and password/i);
    expect(trpcClient.login.logout.mutate).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(secretsStore.sessionId).toBeUndefined();
  });

  it("keeps the throttle warning on edits, but drops it for the stored account", async () => {
    vi.mocked(loginUserCore).mockRejectedValue(new LoginThrottledError());
    renderPage({ isOffline: false });
    await login("mallory@example.com", "some password");
    await screen.findByText(/too many login attempts/i);

    await userEvent.type(screen.getByLabelText("Password"), "x");
    expect(screen.getByText(/too many login attempts/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));
    expect(screen.queryByText(/too many login attempts/i)).not.toBeInTheDocument();
  });
});
