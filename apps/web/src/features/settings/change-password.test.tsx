import { SessionContext, type SessionMode, useChangePassword } from "@repo/client";
import {
  PasswordChangeUnconfirmedError,
  WrongPasswordError,
} from "@repo/client/src/account/change-password";
import {
  generateLocalVault,
  type NewLocalVault,
} from "@repo/client/src/account/create-local-vault";
import {
  getPasswordKekParams,
  retrievePRK,
  setPasswordKekParams,
  unwrapAccountKey,
} from "@repo/crypto";
import type { AccountKeyMaterial } from "@repo/schema";
import { type LocalProfile, secretsStore } from "@repo/store";
import { fromBase64 } from "@repo/util";
import { act, renderHook } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";

// Real hook, keyring and rewrap; the store, the session and the server are replaced.
const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => ({}),
}));
// The real Argon2 derivation, on the main thread (no workers here).
vi.mock("@repo/crypto/services/argon2-worker-service", async () => {
  const { retrievePRK: derive } = await import("@repo/crypto");
  return { argon2WorkerService: { derive } };
});
const changeAccountPassword = vi.hoisted(() => vi.fn());
vi.mock("@repo/client/src/account/change-password", async (importActual) => ({
  ...(await importActual<object>()),
  changeAccountPassword,
}));
const connect = vi.hoisted(() => vi.fn(async () => "online"));
vi.mock("@repo/client/src/hooks/use-connect-server", async (importActual) => ({
  ...(await importActual<object>()),
  useConnectServer: () => ({ connect }),
}));

const PASSWORD = "hunter2hunter2";
const NEW_PASSWORD = "a brand new master password";
const attachServer = vi.fn(async () => undefined);
const detachServer = vi.fn();

function renderChange(mode: SessionMode, networkOffline = false) {
  const session = {
    mode,
    networkOffline,
    attachServer,
    detachServer,
  } as unknown as ContextType<typeof SessionContext>;
  return renderHook(() => useChangePassword(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    ),
  });
}

/** The account key a password opens in `material`; throws when it doesn't. */
async function open(material: AccountKeyMaterial, password: string) {
  const kek = await retrievePRK(
    password,
    fromBase64(material.passwordKekSalt),
    material.passwordKekParams,
  );
  return unwrapAccountKey(kek, material.encryptedAccountKey, material.accountKeyEncryptionNonce);
}

const previous = getPasswordKekParams();
beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
afterAll(() => setPasswordKekParams(previous));

let local: NewLocalVault;
const ALICE: LocalProfile = {
  profileId: "p-alice",
  mode: "linked",
  email: "alice@example.com",
  userId: "u-alice",
};

function useProfile(profile: LocalProfile) {
  store.profiles = [profileEntry(profile)];
  store.profile = profile;
}

beforeEach(async () => {
  vi.clearAllMocks();
  local = await generateLocalVault(PASSWORD);
  useProfile(local.profile);
  store.accountKeyMaterial = local.material;
  store.vault.getVaults.mockResolvedValue(local.vaults);
  secretsStore.unlockWithAccountKey(local.accountKey.slice());
  secretsStore.loadVaultKeys(local.vaults);
});

afterEach(() => {
  vi.restoreAllMocks();
  secretsStore.clearPassword();
  secretsStore.lock();
});

describe("useChangePassword — local vault", () => {
  it("rewraps the account key under the new password, on the device", async () => {
    const { result } = renderChange("local");

    await act(async () => {
      expect(await result.current.changePassword(PASSWORD, NEW_PASSWORD)).toBe(true);
    });

    const [profileId, material, vaults] = store.saveAccount.mock.calls[0]!;
    expect(profileId).toBe(local.profile.profileId);
    expect(vaults).toEqual(local.vaults);
    expect(await open(material, NEW_PASSWORD)).toEqual(local.accountKey);
    await expect(open(material, PASSWORD)).rejects.toThrow();
    expect(material.userKeyPair).toEqual(local.material.userKeyPair);
    // Biometric unlock holds the old password: it goes.
    expect(store.forgetQuickUnlock).toHaveBeenCalledWith(local.profile.profileId);
    expect(changeAccountPassword).not.toHaveBeenCalled();
    expect(result.current.changeError).toBeUndefined();
  });

  it("refuses a wrong current password and changes nothing", async () => {
    const { result } = renderChange("local");

    await act(async () => {
      expect(await result.current.changePassword("not my password", NEW_PASSWORD)).toBe(false);
    });

    expect(result.current.changeError).toBe("wrong_password");
    expect(store.saveAccount).not.toHaveBeenCalled();
    expect(store.forgetQuickUnlock).not.toHaveBeenCalled();
  });

  it("needs the unlocked vault", async () => {
    secretsStore.lock();
    const { result } = renderChange("local");

    await act(async () => {
      expect(await result.current.changePassword(PASSWORD, NEW_PASSWORD)).toBe(false);
    });
    expect(result.current.changeError).toBe("failed");
  });
});

describe("useChangePassword — linked account", () => {
  beforeEach(() => {
    useProfile(ALICE);
    vi.spyOn(secretsStore, "hasServerSession", "get").mockReturnValue(true);
  });

  it.each([
    ["offline", false],
    ["online", true],
  ] as const)("is blocked while %s (network down: %s)", async (mode, networkOffline) => {
    const { result } = renderChange(mode, networkOffline);
    expect(result.current.blocked).toBe(true);

    await act(async () => {
      expect(await result.current.changePassword(PASSWORD, NEW_PASSWORD)).toBe(false);
    });

    expect(result.current.changeError).toBe("offline");
    expect(changeAccountPassword).not.toHaveBeenCalled();
    expect(store.saveAccount).not.toHaveBeenCalled();
  });

  it("is blocked without a server session", async () => {
    vi.spyOn(secretsStore, "hasServerSession", "get").mockReturnValue(false);
    const { result } = renderChange("online");

    await act(async () => {
      await result.current.changePassword(PASSWORD, NEW_PASSWORD);
    });
    expect(result.current.changeError).toBe("offline");
    expect(changeAccountPassword).not.toHaveBeenCalled();
  });

  it("changes it on the server, stores the new wrap, then logs in again", async () => {
    const changed = { ...local.material, passwordKekSalt: "new-salt" };
    changeAccountPassword.mockResolvedValue(changed);
    const { result } = renderChange("online");

    await act(async () => {
      expect(await result.current.changePassword(PASSWORD, NEW_PASSWORD)).toBe(true);
    });

    expect(changeAccountPassword).toHaveBeenCalledWith(
      expect.anything(),
      attachServer,
      ALICE,
      local.material,
      PASSWORD,
      NEW_PASSWORD,
    );
    expect(store.saveAccount).toHaveBeenCalledWith(ALICE.profileId, changed, local.vaults);
    expect(store.forgetQuickUnlock).toHaveBeenCalledWith(ALICE.profileId);
    // Every session was revoked: drop it, log in with the new password.
    expect(detachServer).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith(NEW_PASSWORD);
    expect(store.saveAccount.mock.invocationCallOrder[0]).toBeLessThan(
      connect.mock.invocationCallOrder[0]!,
    );
    expect(secretsStore.getPassword()).toBeUndefined();
  });

  it("keeps the new password for the auto-reconnect when logging in again fails", async () => {
    changeAccountPassword.mockResolvedValue(local.material);
    connect.mockResolvedValueOnce("unreachable");
    const { result } = renderChange("online");

    await act(async () => {
      expect(await result.current.changePassword(PASSWORD, NEW_PASSWORD)).toBe(true);
    });

    expect(secretsStore.getPassword()).toBe(NEW_PASSWORD);
  });

  it("reports a wrong current password", async () => {
    changeAccountPassword.mockRejectedValue(new WrongPasswordError());
    const { result } = renderChange("online");

    await act(async () => {
      expect(await result.current.changePassword("nope nope", NEW_PASSWORD)).toBe(false);
    });

    expect(result.current.changeError).toBe("wrong_password");
    expect(store.saveAccount).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  describe("when the change got no answer", () => {
    beforeEach(() => {
      changeAccountPassword.mockRejectedValue(new PasswordChangeUnconfirmedError(local.material));
    });

    it("counts it as done when the new password logs in", async () => {
      const { result } = renderChange("online");

      await act(async () => {
        expect(await result.current.changePassword(PASSWORD, NEW_PASSWORD)).toBe(true);
      });

      expect(detachServer).toHaveBeenCalled();
      expect(connect).toHaveBeenCalledTimes(1);
      expect(connect).toHaveBeenCalledWith(NEW_PASSWORD);
      expect(store.forgetQuickUnlock).toHaveBeenCalledWith(ALICE.profileId);
    });

    it("goes back online with the current password when the new one is refused", async () => {
      connect.mockResolvedValueOnce("rejected");
      const { result } = renderChange("online");

      await act(async () => {
        expect(await result.current.changePassword(PASSWORD, NEW_PASSWORD)).toBe(false);
      });

      expect(result.current.changeError).toBe("failed");
      expect(connect).toHaveBeenNthCalledWith(2, PASSWORD);
      expect(store.saveAccount).not.toHaveBeenCalled();
      expect(store.forgetQuickUnlock).not.toHaveBeenCalled();
    });

    it("says it's unconfirmed and retries the new password later when the server is gone", async () => {
      connect.mockResolvedValueOnce("unreachable");
      const { result } = renderChange("online");

      await act(async () => {
        expect(await result.current.changePassword(PASSWORD, NEW_PASSWORD)).toBe(false);
      });

      expect(result.current.changeError).toBe("unconfirmed");
      expect(secretsStore.getPassword()).toBe(NEW_PASSWORD);
      expect(store.saveAccount).not.toHaveBeenCalled();
    });
  });
});
