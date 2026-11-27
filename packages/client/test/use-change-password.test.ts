// @vitest-environment jsdom
import { getPasswordKekParams, SESSION_SIGNED_OUT, setPasswordKekParams } from "@repo/crypto";
import { type LocalProfile, ProfileStore, secretsStore } from "@repo/store";
import { createTestDatabases } from "@repo/store/testing";
import { installFakeSealer } from "@repo/store/testing/fake-sealer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { act, type ContextType, createElement, useContext } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLocalPassword, PasswordChangeFailedError } from "../src/account/change-password";
import { generateLocalVault, type NewLocalVault } from "../src/account/create-local-vault";
import { useChangePassword } from "../src/hooks/use-change-password";
import { useSessionRestore } from "../src/hooks/use-session-restore";
import {
  type AccountLogin,
  type LoginSessionFn,
  LoginThrottledError,
  type SecondFactorPrompt,
} from "../src/login";
import { PreferencesProvider } from "../src/providers/PreferencesProvider";
import SessionProvider, { SessionContext } from "../src/providers/SessionProvider";
import { StoreProvider, useStore } from "../src/providers/StoreProvider";
import { persistSession } from "../src/util/persist-session";

// The mobile build: the native login bundle over an in-memory Keychain, the real StoreProvider,
// SessionProvider and hook; only the server is replaced.
const keychain = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  setItemAsync: async (key: string, value: string) => void keychain.set(key, value),
  getItemAsync: async (key: string) => keychain.get(key) ?? null,
  deleteItemAsync: async (key: string) => void keychain.delete(key),
}));
const clearLoginBundle = vi.hoisted(() => vi.fn());
// The store module itself, so ProfileStore's own imports get the native login bundle too.
vi.mock("@repo/store/testing/session-persistence", async () => {
  // Typed as the web module (same exports): the native file compiles only in the store's tsconfig.
  const native = await vi.importActual<typeof import("@repo/store")>(
    "@repo/store/testing/session-persistence-native",
  );
  clearLoginBundle.mockImplementation(native.clearLoginBundle);
  return { ...native, clearLoginBundle };
});
vi.mock(
  "@repo/crypto/services/decrypt-worker-service",
  () => import("@repo/crypto/services/decrypt-worker-service.native"),
);
const trpcClient = vi.hoisted(() => ({ user: { heartbeat: { query: vi.fn() } } }));
vi.mock("../src/util/trpc", () => ({ useTRPC: () => ({}), useTRPCClient: () => trpcClient }));
const changeAccountPassword = vi.hoisted(() => vi.fn());
vi.mock("../src/account/change-password", async (importActual) => ({
  ...(await importActual<object>()),
  changeAccountPassword,
}));
const loginWithOpaquePassword = vi.hoisted(() => vi.fn());
vi.mock("../src/login", async (importActual) => ({
  ...(await importActual<object>()),
  loginWithOpaquePassword,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PASSWORD = "hunter2hunter2";
const NEW_PASSWORD = "a brand new password";
const ALICE: LocalProfile = {
  profileId: "p-alice",
  mode: "linked",
  email: "alice@example.com",
  userId: "u-alice",
};
const salt = () => new Uint8Array(32).fill(3);
const persistedLogin = () =>
  JSON.parse(keychain.get(`passmgr.login-bundle.${ALICE.profileId}`)!) as {
    server?: { sessionId: string };
  };
/** The persisted login as `finishPasswordChange` goes out. */
let persistedAtFinish: ReturnType<typeof persistedLogin> | undefined;

type App = {
  store: ReturnType<typeof useStore>;
  session: ContextType<typeof SessionContext>;
  change: ReturnType<typeof useChangePassword>;
  restore: ReturnType<typeof useSessionRestore>;
};

let local: NewLocalVault;
let profiles: ProfileStore;
const onSignedOut = vi.fn();
const unmounts: (() => void)[] = [];

/** An app launch on the same device: the profile databases and the Keychain carry over. */
async function launch() {
  const app = {} as App;
  function Probe() {
    app.store = useStore();
    app.session = useContext(SessionContext);
    app.change = useChangePassword(vi.fn<SecondFactorPrompt>());
    app.restore = useSessionRestore();
    return null;
  }
  const preferences = new Map<string, string>();
  const store = createElement(StoreProvider, {
    profiles,
    syncEnabled: false,
    onSignedOut,
    biometricSupport: async () => false,
    children: createElement(Probe),
  });
  const tree = createElement(QueryClientProvider, {
    client: new QueryClient(),
    children: createElement(PreferencesProvider, {
      store: {
        get: (key) => preferences.get(key) ?? null,
        set: (key, value) => void preferences.set(key, value),
        remove: (key) => void preferences.delete(key),
      },
      children: createElement(SessionProvider, { children: store }),
    }),
  });
  const root = createRoot(document.createElement("div"));
  act(() => root.render(tree));
  unmounts.push(() => root.unmount());
  await vi.waitFor(() => expect(app.store.active?.entry.profileId).toBe(ALICE.profileId));
  return app;
}

/** Unlocked online with a persisted login, as a password login leaves the app. */
async function signIn(app: App) {
  const { active } = app.store;
  act(() =>
    app.session.unlockWithAccountKey(
      "linked",
      local.accountKey.slice(),
      local.vaults,
      local.material.userKeyPair,
    ),
  );
  await act(() => app.session.attachServer("s-old", new Uint8Array(32).fill(1), salt()));
  await persistSession(active!.entry.profileId);
}

/** The server's answer to a login once it took the new password. */
function loginWithNewPassword(app: App) {
  return async (_trpc: unknown, session: LoginSessionFn): Promise<AccountLogin> => {
    await session("s-new", new Uint8Array(32).fill(2), salt());
    const { userKeyPair, ...userPasswordKeys } = app.store.current()!.accountKeyMaterial!;
    return {
      userId: ALICE.userId,
      userPasswordKeys,
      recoveryKeys: local.recovery,
      vaultKeys: local.vaults,
      userKeyPair,
    } as unknown as AccountLogin;
  };
}

const previous = getPasswordKekParams();
beforeAll(async () => {
  setPasswordKekParams({ t: 1, m: 8, p: 1 });
  local = await generateLocalVault(PASSWORD);
});
afterAll(() => setPasswordKekParams(previous));

beforeEach(async () => {
  vi.clearAllMocks();
  secretsStore.lock();
  keychain.clear();
  installFakeSealer();
  profiles = new ProfileStore(createTestDatabases().open);
  const { recoveryVerifier: _verifier, ...recoveryWrap } = local.recovery;
  await profiles.create(ALICE, (vault) =>
    vault.setAccountKeyMaterial(local.material, local.vaults, { profile: ALICE, recoveryWrap }),
  );
  persistedAtFinish = undefined;
  // The fresh login ends the old session and attaches its own, then `finishPasswordChange` goes out.
  changeAccountPassword.mockImplementation(
    async (
      _trpc,
      attach: LoginSessionFn,
      _profile,
      material,
      current: string,
      next: string,
      _prompt,
      beforeLogin: () => Promise<void>,
    ) => {
      await beforeLogin();
      await attach("s-fresh", new Uint8Array(32).fill(4), salt());
      persistedAtFinish = persistedLogin();
      return changeLocalPassword(material, current, next);
    },
  );
  // The server revoked every session of the account with the change.
  trpcClient.user.heartbeat.query.mockRejectedValue(
    Object.assign(new TRPCClientError(SESSION_SIGNED_OUT), { data: { code: "UNAUTHORIZED" } }),
  );
});

afterEach(() => {
  for (const unmount of unmounts.splice(0)) act(unmount);
  secretsStore.lock();
});

describe("useChangePassword on mobile (linked)", () => {
  it("keeps the persisted login, which then holds the new session", async () => {
    const app = await launch();
    await signIn(app);
    loginWithOpaquePassword.mockImplementation(loginWithNewPassword(app));

    expect(await act(() => app.change.changePassword(PASSWORD, NEW_PASSWORD))).toBe(true);

    expect(clearLoginBundle).not.toHaveBeenCalled();
    expect(app.session.mode).toBe("online");
    expect(secretsStore.sessionId).toBe("s-new");
    expect(persistedLogin().server?.sessionId).toBe("s-new");
  });

  it("persists the login without a server session before the fresh login", async () => {
    const app = await launch();
    await signIn(app);
    loginWithOpaquePassword.mockImplementation(loginWithNewPassword(app));

    expect(await act(() => app.change.changePassword(PASSWORD, NEW_PASSWORD))).toBe(true);

    expect(persistedAtFinish).toBeDefined();
    expect(persistedAtFinish?.server).toBeUndefined();
    expect(persistedLogin().server?.sessionId).toBe("s-new");
  });

  it.each([
    ["failed", new PasswordChangeFailedError()],
    ["throttled", new LoginThrottledError()],
  ])("persists the attached session again when the change is refused (%s)", async (error, e) => {
    const app = await launch();
    await signIn(app);
    const refuse = changeAccountPassword.getMockImplementation()!;
    changeAccountPassword.mockImplementation(async (...args: unknown[]) => {
      await refuse(...args);
      throw e;
    });

    expect(await act(() => app.change.changePassword(PASSWORD, NEW_PASSWORD))).toBe(false);

    expect(app.change.changeError).toBe(error);
    expect(persistedAtFinish?.server).toBeUndefined();
    expect(app.session.mode).toBe("online");
    expect(persistedLogin().server?.sessionId).toBe("s-fresh");
    expect(loginWithOpaquePassword).not.toHaveBeenCalled();
  });

  it("restores offline on the next launch when the app died after the fresh login", async () => {
    const app = await launch();
    await signIn(app);
    // The app dies after the fresh login ended "s-old", before `finishPasswordChange` goes out.
    changeAccountPassword.mockImplementation(
      async (_trpc, attach: LoginSessionFn, ...rest: unknown[]) => {
        await (rest[5] as () => Promise<void>)();
        await attach("s-fresh", new Uint8Array(32).fill(4), salt());
        return new Promise(() => {});
      },
    );
    void app.change.changePassword(PASSWORD, NEW_PASSWORD);
    await vi.waitFor(() => expect(secretsStore.sessionId).toBe("s-fresh"));
    for (const unmount of unmounts.splice(0)) act(unmount);
    secretsStore.lock();

    expect(persistedLogin().server).toBeUndefined();
    const next = await launch();
    await act(() => next.restore.tryRestore());

    expect(next.restore.status).toBe("restored");
    expect(next.session.mode).toBe("offline");
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(clearLoginBundle).not.toHaveBeenCalled();
  });

  it("unlocks normally on the next launch when the app died before the reconnect", async () => {
    const app = await launch();
    await signIn(app);
    // The app dies while the login with the new password is still out.
    loginWithOpaquePassword.mockImplementation(() => new Promise(() => {}));
    void app.change.changePassword(PASSWORD, NEW_PASSWORD);
    await vi.waitFor(() => expect(loginWithOpaquePassword).toHaveBeenCalled());
    for (const unmount of unmounts.splice(0)) act(unmount);
    secretsStore.lock();

    const next = await launch();
    await act(() => next.restore.tryRestore());

    expect(next.restore.status).toBe("restored");
    expect(next.session.vaultUnlocked).toBe(true);
    expect(next.session.mode).toBe("offline");
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(clearLoginBundle).not.toHaveBeenCalled();
  });

  it("clears the persisted login when ProfileStore.remove removes the profile", async () => {
    const app = await launch();
    await signIn(app);
    for (const unmount of unmounts.splice(0)) act(unmount);
    secretsStore.lock();
    expect(persistedLogin().server?.sessionId).toBe("s-old");

    await profiles.remove(ALICE.profileId);

    expect([...keychain.keys()].filter((key) => key.endsWith(ALICE.profileId))).toEqual([]);
  });
});
