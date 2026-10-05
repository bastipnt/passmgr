import { SessionContext, useCreateLocalVault } from "@repo/client";
import { getPasswordKekParams, setPasswordKekParams } from "@repo/crypto";
import { secretsStore, VaultExistsError } from "@repo/store";
import { act, renderHook } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real hook and keyring generation; the store and the session are replaced.
const store = {
  profile: null as object | null,
  accountKeyMaterial: null as object | null,
  needsBiometricEnroll: false,
  createLocalVault: vi.fn(),
};
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
// Keeps a reference to the generated account key, to check it gets wiped.
const generated: { accountKey?: Uint8Array } = {};
vi.mock("@repo/client/src/account/create-local-vault", async (importActual) => {
  const actual = await importActual<typeof import("@repo/client/src/account/create-local-vault")>();
  return {
    generateLocalVault: async (password: string) => {
      const created = await actual.generateLocalVault(password);
      generated.accountKey = created.accountKey;
      return created;
    },
  };
});
vi.mock("@repo/crypto/services/decrypt-worker-service", () => ({
  decryptWorkerService: { init: vi.fn() },
}));

const unlockWithAccountKey = vi.fn();
const session = {
  vaultUnlocked: false,
  networkOffline: false,
  unlockWithAccountKey,
} as unknown as ContextType<typeof SessionContext>;

function renderCreate() {
  return renderHook(() => useCreateLocalVault(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    ),
  });
}

const previous = getPasswordKekParams();
beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
afterAll(() => setPasswordKekParams(previous));

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  store.createLocalVault.mockReset();
  unlockWithAccountKey.mockReset();
  store.profile = null;
  store.accountKeyMaterial = null;
  store.needsBiometricEnroll = false;
  vi.spyOn(secretsStore, "exportVaultKeysForWorker").mockReturnValue(new Map());
});

describe("useCreateLocalVault", () => {
  it("stores a local keyring, then unlocks it as `local` once finished", async () => {
    const { result } = renderCreate();

    let recoveryKey: Uint8Array | undefined;
    await act(async () => {
      recoveryKey = await result.current.createLocalVault("hunter2hunter2");
    });

    expect(recoveryKey).toHaveLength(32);
    expect(store.createLocalVault).toHaveBeenCalledTimes(1);
    const [material, recovery, vaults, profile] = store.createLocalVault.mock.calls[0]!;
    expect(profile).toMatchObject({ mode: "local", email: null, userId: null });
    expect(vaults).toHaveLength(1);
    expect(recovery.recoveryVerifier).toBeTypeOf("string");
    // Not unlocked until the recovery key is saved.
    expect(unlockWithAccountKey).not.toHaveBeenCalled();

    await act(async () => {
      expect(await result.current.finishLocalVault()).toBe(true);
    });
    expect(unlockWithAccountKey).toHaveBeenCalledWith(
      "local",
      expect.any(Uint8Array),
      vaults,
      material.userKeyPair,
    );
    // Only once: a second finish has nothing left.
    await act(async () => {
      expect(await result.current.finishLocalVault()).toBe(false);
    });
  });

  it("keeps the password for biometric enrollment only when it comes next", async () => {
    store.needsBiometricEnroll = true;
    const setPassword = vi.spyOn(secretsStore, "setPassword");
    const { result } = renderCreate();

    await act(async () => {
      await result.current.createLocalVault("hunter2hunter2");
      await result.current.finishLocalVault();
    });

    expect(setPassword).toHaveBeenCalledWith("hunter2hunter2");
  });

  it("doesn't keep the password when no biometric enrollment follows", async () => {
    const setPassword = vi.spyOn(secretsStore, "setPassword");
    const { result } = renderCreate();

    await act(async () => {
      await result.current.createLocalVault("hunter2hunter2");
      await result.current.finishLocalVault();
    });

    expect(setPassword).not.toHaveBeenCalled();
  });

  it("reports a created vault that doesn't open as `unlock_failed`, wiping the key", async () => {
    unlockWithAccountKey.mockImplementationOnce(() => {
      throw new Error("keyring doesn't open");
    });
    const { result } = renderCreate();
    await act(async () => {
      await result.current.createLocalVault("hunter2hunter2");
    });

    await act(async () => {
      expect(await result.current.finishLocalVault()).toBe(false);
    });

    expect(result.current.createError).toBe("unlock_failed");
    expect(generated.accountKey?.every((byte) => byte === 0)).toBe(true);
  });

  it("never creates a vault over the one on the device", async () => {
    store.profile = { mode: "linked" };
    const { result } = renderCreate();

    await act(async () => {
      expect(await result.current.createLocalVault("hunter2hunter2")).toBeUndefined();
    });

    expect(result.current.createError).toBe("vault_exists");
    expect(store.createLocalVault).not.toHaveBeenCalled();
  });

  it("reports the store refusing (a vault created meanwhile, e.g. in another tab)", async () => {
    store.createLocalVault.mockRejectedValue(new VaultExistsError());
    const { result } = renderCreate();

    await act(async () => {
      expect(await result.current.createLocalVault("hunter2hunter2")).toBeUndefined();
    });

    expect(result.current.createError).toBe("vault_exists");
    await act(async () => {
      expect(await result.current.finishLocalVault()).toBe(false);
    });
  });

  it("wipes the account key it held when left before finishing", async () => {
    const { result, unmount } = renderCreate();
    await act(async () => {
      await result.current.createLocalVault("hunter2hunter2");
    });

    expect(generated.accountKey?.some((byte) => byte !== 0)).toBe(true);

    unmount();

    expect(unlockWithAccountKey).not.toHaveBeenCalled();
    expect(generated.accountKey?.every((byte) => byte === 0)).toBe(true);
  });
});
