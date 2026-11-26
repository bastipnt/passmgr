// @vitest-environment jsdom
import { getPasswordKekParams, setPasswordKekParams } from "@repo/crypto";
import type { AccountKeyMaterial } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { act, type ContextType, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLocalVault, type NewLocalVault } from "../src/account/create-local-vault";
import { ServerKeyringMismatchError } from "../src/account/verify-server-keyring";
import { type ServerLogin, useConnectServer } from "../src/hooks/use-connect-server";
import {
  type AccountLogin,
  DeviceLoginRejectedError,
  type LoginSessionFn,
  LoginThrottledError,
  OpaqueLoginFailedError,
  SecondFactorCancelledError,
  SecondFactorExpiredError,
  type SecondFactorPrompt,
} from "../src/login";
import { SessionContext } from "../src/providers/SessionProvider";

// Real hook, HeldSession and secretsStore; the store, the server and the key check are replaced.
const store = vi.hoisted(() => ({
  active: null as unknown,
  current: () => store.active,
  saveAccount: vi.fn(),
}));
vi.mock("../src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
  reloadVaultKeys: vi.fn(),
}));
vi.mock("../src/util/trpc", () => ({ useTRPC: () => ({}), useTRPCClient: () => ({}) }));
vi.mock("../src/util/persist-session", () => ({ persistSession: vi.fn(async () => {}) }));
const reconnectKeyMaterial = vi.hoisted(() => vi.fn());
vi.mock("../src/account/verify-server-keyring", async (importActual) => ({
  ...(await importActual<object>()),
  reconnectKeyMaterial,
}));
const deriveOpaquePassword = vi.hoisted(() =>
  vi.fn<(password: string, email: string) => Promise<Uint8Array>>(),
);
vi.mock("@repo/crypto", async (importActual) => ({
  ...(await importActual<object>()),
  deriveOpaquePassword,
}));
const loginWithOpaquePassword = vi.hoisted(() => vi.fn());
vi.mock("../src/login", async (importActual) => ({
  ...(await importActual<object>()),
  loginWithOpaquePassword,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const USER_ID = "u-alice";
const attachServer = vi.fn<LoginSessionFn>();
const getVaults = vi.fn();

const unmounts: (() => void)[] = [];
function renderConnect() {
  const result = { current: undefined as unknown as ReturnType<typeof useConnectServer> };
  function Probe() {
    result.current = useConnectServer(vi.fn<SecondFactorPrompt>());
    return null;
  }
  const session = { attachServer } as unknown as ContextType<typeof SessionContext>;
  const root = createRoot(document.createElement("div"));
  act(() =>
    root.render(createElement(SessionContext.Provider, { value: session }, createElement(Probe))),
  );
  unmounts.push(() => root.unmount());
  return result.current;
}

const isZero = (bytes: Uint8Array) => bytes.every((b) => b === 0);
const salt = () => new Uint8Array<ArrayBuffer>(new ArrayBuffer(32));

let local: NewLocalVault;
let info: AccountLogin;
let sessionKey: Uint8Array;

/** A login that gets a session (its key `sessionKey`), then ends with `outcome`. */
function loginThen(outcome: () => AccountLogin | Promise<AccountLogin> = () => info): ServerLogin {
  return async (session) => {
    await session("s-1", sessionKey, salt());
    return await outcome();
  };
}

const previous = getPasswordKekParams();
beforeAll(async () => {
  setPasswordKekParams({ t: 1, m: 8, p: 1 });
  local = await generateLocalVault("hunter2hunter2");
});
afterAll(() => setPasswordKekParams(previous));

beforeEach(() => {
  vi.resetAllMocks();
  secretsStore.unlockWithAccountKey(local.accountKey.slice());
  secretsStore.loadVaultKeys(local.vaults);
  sessionKey = new Uint8Array(32).fill(5);
  info = {
    userId: USER_ID,
    userPasswordKeys: local.material,
    recoveryKeys: local.recovery,
    vaultKeys: local.vaults,
    userKeyPair: local.material.userKeyPair,
  } as unknown as AccountLogin;
  store.active = {
    entry: { profileId: local.profile.profileId },
    profile: { ...local.profile, mode: "linked", email: "alice@example.com", userId: USER_ID },
    accountKeyMaterial: local.material,
    pendingRecovery: false,
    vault: { getVaults },
  };
  getVaults.mockResolvedValue(local.vaults);
  reconnectKeyMaterial.mockImplementation(async (): Promise<AccountKeyMaterial> => local.material);
  store.saveAccount.mockResolvedValue(undefined);
  attachServer.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const unmount of unmounts.splice(0)) act(unmount);
  secretsStore.lock();
});

describe("useConnectServer", () => {
  it("attaches a checked session, handing its key over unwiped", async () => {
    const { connectWithDevice } = renderConnect();

    expect(await connectWithDevice(loginThen())).toBe("online");

    expect(attachServer).toHaveBeenCalledWith("s-1", sessionKey, expect.any(Uint8Array));
    expect(isZero(sessionKey)).toBe(false);
  });

  it.each([
    ["rejected", new OpaqueLoginFailedError()],
    ["rejected", new DeviceLoginRejectedError()],
    ["second_factor", new SecondFactorCancelledError()],
    ["second_factor", new SecondFactorExpiredError()],
    ["throttled", new LoginThrottledError()],
    ["unreachable", new Error("network")],
  ])("reads a login that fails as %s, wiping a session it held (%o)", async (result, error) => {
    const { connectWithDevice } = renderConnect();

    expect(
      await connectWithDevice(
        loginThen(() => {
          throw error;
        }),
      ),
    ).toBe(result);

    expect(isZero(sessionKey)).toBe(true);
    expect(attachServer).not.toHaveBeenCalled();
  });

  it("reads a login that holds no session as unreachable", async () => {
    const { connectWithDevice } = renderConnect();

    expect(await connectWithDevice(async () => info)).toBe("unreachable");

    expect(attachServer).not.toHaveBeenCalled();
  });

  it("rejects another account behind the email and wipes its session key", async () => {
    const { connectWithDevice } = renderConnect();

    expect(await connectWithDevice(loginThen(() => ({ ...info, userId: "u-other" })))).toBe(
      "rejected",
    );

    expect(isZero(sessionKey)).toBe(true);
    expect(reconnectKeyMaterial).not.toHaveBeenCalled();
    expect(attachServer).not.toHaveBeenCalled();
  });

  it("cancels when the vault is locked during the login, and wipes the session key", async () => {
    const { connectWithDevice } = renderConnect();

    expect(
      await connectWithDevice(
        loginThen(() => {
          secretsStore.lock();
          return info;
        }),
      ),
    ).toBe("cancelled");

    expect(isZero(sessionKey)).toBe(true);
    expect(attachServer).not.toHaveBeenCalled();
  });

  it("rejects server keys that don't open this vault, and wipes the session key", async () => {
    reconnectKeyMaterial.mockRejectedValueOnce(new ServerKeyringMismatchError());
    const { connectWithDevice } = renderConnect();

    expect(await connectWithDevice(loginThen())).toBe("rejected");

    expect(isZero(sessionKey)).toBe(true);
    expect(attachServer).not.toHaveBeenCalled();
  });

  it("reads a failing key check as unreachable, and wipes the session key", async () => {
    getVaults.mockRejectedValueOnce(new Error("sqlite busy"));
    const { connectWithDevice } = renderConnect();

    expect(await connectWithDevice(loginThen())).toBe("unreachable");

    expect(isZero(sessionKey)).toBe(true);
    expect(attachServer).not.toHaveBeenCalled();
  });

  it("cancels a key check that failed because the vault was locked, and wipes the session key", async () => {
    reconnectKeyMaterial.mockImplementationOnce(async () => {
      secretsStore.lock();
      throw new ServerKeyringMismatchError();
    });
    const { connectWithDevice } = renderConnect();

    expect(await connectWithDevice(loginThen())).toBe("cancelled");

    expect(isZero(sessionKey)).toBe(true);
  });

  it("cancels when the vault is locked during the key check, and wipes the session key", async () => {
    reconnectKeyMaterial.mockImplementationOnce(async () => {
      secretsStore.lock();
      return local.material;
    });
    const { connectWithDevice } = renderConnect();

    expect(await connectWithDevice(loginThen())).toBe("cancelled");

    expect(isZero(sessionKey)).toBe(true);
    expect(store.saveAccount).not.toHaveBeenCalled();
  });

  it("reads a failing save as unreachable, and wipes the session key", async () => {
    store.saveAccount.mockRejectedValueOnce(new Error("disk full"));
    const { connectWithDevice } = renderConnect();

    expect(await connectWithDevice(loginThen())).toBe("unreachable");

    expect(isZero(sessionKey)).toBe(true);
    expect(attachServer).not.toHaveBeenCalled();
  });

  it("cancels when the vault is locked during the save, and wipes the session key", async () => {
    store.saveAccount.mockImplementationOnce(async () => secretsStore.lock());
    const { connectWithDevice } = renderConnect();

    expect(await connectWithDevice(loginThen())).toBe("cancelled");

    expect(isZero(sessionKey)).toBe(true);
    expect(attachServer).not.toHaveBeenCalled();
  });

  it("reads a failing attach as unreachable, and wipes the session key", async () => {
    attachServer.mockRejectedValueOnce(new Error("hkdf failed"));
    const { connectWithDevice } = renderConnect();

    expect(await connectWithDevice(loginThen())).toBe("unreachable");

    expect(isZero(sessionKey)).toBe(true);
  });

  it("cancels before the login when the vault is locked or the profile isn't linked", async () => {
    const login = vi.fn(loginThen());
    const { connectWithDevice } = renderConnect();

    store.active = { ...(store.active as object), profile: local.profile };
    expect(await connectWithDevice(login)).toBe("cancelled");
    secretsStore.lock();
    expect(await connectWithDevice(login)).toBe("cancelled");

    expect(login).not.toHaveBeenCalled();
  });

  it("reads a profile without key material as unreachable, before the login", async () => {
    store.active = { ...(store.active as object), accountKeyMaterial: null };
    const login = vi.fn(loginThen());
    const { connectWithDevice } = renderConnect();

    expect(await connectWithDevice(login)).toBe("unreachable");

    expect(login).not.toHaveBeenCalled();
  });

  it("wipes the OPAQUE password and the session key when a password reconnect fails", async () => {
    const opaquePassword = new Uint8Array(32).fill(9);
    loginWithOpaquePassword.mockImplementationOnce(async (_trpc, session: LoginSessionFn) => {
      await session("s-1", sessionKey, salt());
      throw new Error("network");
    });
    const { connect } = renderConnect();

    expect(await connect(opaquePassword)).toBe("unreachable");

    expect(isZero(opaquePassword)).toBe(true);
    expect(isZero(sessionKey)).toBe(true);
  });

  it("wipes the OPAQUE password derived for a connect whose pending reset fails", async () => {
    const opaquePassword = new Uint8Array(32).fill(9);
    deriveOpaquePassword.mockResolvedValueOnce(opaquePassword);
    const getPendingRecovery = vi.fn(async () => {
      throw new Error("sqlite busy");
    });
    store.active = {
      ...(store.active as object),
      pendingRecovery: true,
      vault: { getVaults, getPendingRecovery },
    };
    const { connect } = renderConnect();

    expect(await connect("hunter2hunter2")).toBe("unreachable");

    expect(deriveOpaquePassword).toHaveBeenCalledWith("hunter2hunter2", "alice@example.com");
    expect(getPendingRecovery).toHaveBeenCalledOnce();
    expect(isZero(opaquePassword)).toBe(true);
    expect(loginWithOpaquePassword).not.toHaveBeenCalled();
  });

  it("wipes the OPAQUE password of a connect that joins one in flight", async () => {
    let finish!: () => void;
    loginWithOpaquePassword.mockImplementationOnce(async (_trpc, session: LoginSessionFn) => {
      await session("s-1", sessionKey, salt());
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      throw new OpaqueLoginFailedError();
    });
    const { connect } = renderConnect();
    const first = connect(new Uint8Array(32).fill(9));
    await vi.waitFor(() => expect(finish).toBeDefined());

    const joining = new Uint8Array(32).fill(8);
    const second = connect(joining);
    expect(isZero(joining)).toBe(true);
    finish();

    expect(await Promise.all([first, second])).toEqual(["rejected", "rejected"]);
    expect(isZero(sessionKey)).toBe(true);
  });
});
