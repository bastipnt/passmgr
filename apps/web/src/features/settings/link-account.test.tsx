import { SessionContext, useLinkAccount } from "@repo/client";
import {
  generateLocalVault,
  type NewLocalVault,
} from "@repo/client/src/account/create-local-vault";
import {
  LinkAccountMismatchError,
  LinkRejectedError,
} from "@repo/client/src/account/link-local-vault";
import { getPasswordKekParams, setPasswordKekParams } from "@repo/crypto";
import { secretsStore } from "@repo/store";
import { act, renderHook } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";

// Real hook, keyring and password check; the store, the session and the server are replaced.
const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
const logout = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => ({ login: { logout: { mutate: logout } } }),
}));
// The real Argon2 derivation, on the main thread (no workers here).
vi.mock("@repo/crypto/services/argon2-worker-service", async () => {
  const { retrievePRK } = await import("@repo/crypto");
  return { argon2WorkerService: { derive: retrievePRK } };
});
const registerLocalVault = vi.hoisted(() => vi.fn());
vi.mock("@repo/client/src/account/link-local-vault", async (importActual) => ({
  ...(await importActual<object>()),
  registerLocalVault,
}));

const PASSWORD = "hunter2hunter2";
const linkServer = vi.fn(async () => undefined);
const session = { linkServer } as unknown as ContextType<typeof SessionContext>;

function renderLink() {
  return renderHook(() => useLinkAccount(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    ),
  });
}

const previous = getPasswordKekParams();
beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
afterAll(() => setPasswordKekParams(previous));

let local: NewLocalVault;
const serverSession = ["s-1", "session-key", new Uint8Array(32)] as const;

beforeEach(async () => {
  vi.clearAllMocks();
  local = await generateLocalVault(PASSWORD);
  store.profiles = [profileEntry(local.profile)];
  store.profile = local.profile;
  store.accountKeyMaterial = local.material;
  store.vault.getVaults.mockResolvedValue(local.vaults);
  store.vault.getRecoveryKeyMaterial.mockResolvedValue(local.recovery);
  secretsStore.unlockWithAccountKey(local.accountKey);
  secretsStore.loadVaultKeys(local.vaults);

  registerLocalVault.mockImplementation(async () => ({
    info: {
      email: "alice@example.com",
      userId: "u-alice",
      password: PASSWORD,
      userPasswordKeys: local.material,
      vaultKeys: local.vaults,
      userKeyPair: local.material.userKeyPair,
    },
    session: serverSession,
  }));
});

afterEach(() => secretsStore.lock());

describe("useLinkAccount", () => {
  it("registers the vault's own keyring, links the profile, then goes online", async () => {
    const { result } = renderLink();

    await act(async () => {
      expect(await result.current.linkAccount(" Alice@Example.com ", PASSWORD, "")).toBe(true);
    });

    const [, email, password, keyring, invite] = registerLocalVault.mock.calls[0]!;
    expect({ email, password, invite }).toEqual({
      email: "alice@example.com",
      password: PASSWORD,
      invite: undefined,
    });
    expect(keyring).toMatchObject({
      userKeys: { ...local.recovery, encryptedAccountKey: local.material.encryptedAccountKey },
      personalVault: { vaultId: local.vaults[0]!.vaultId },
      userKeyPair: local.material.userKeyPair,
    });
    expect(store.saveAccount).toHaveBeenCalledWith(
      local.profile.profileId,
      expect.objectContaining({ encryptedAccountKey: local.material.encryptedAccountKey }),
      local.vaults,
      { ...local.profile, mode: "linked", email: "alice@example.com", userId: "u-alice" },
    );
    expect(linkServer).toHaveBeenCalledWith(...serverSession);
    // The profile is linked before the session goes online (which starts the upload).
    expect(store.saveAccount.mock.invocationCallOrder[0]).toBeLessThan(
      linkServer.mock.invocationCallOrder[0]!,
    );
    expect(result.current.linkError).toBeUndefined();
  });

  it("checks the password locally before contacting the server", async () => {
    const { result } = renderLink();

    await act(async () => {
      expect(await result.current.linkAccount("alice@example.com", "wrong password")).toBe(false);
    });

    expect(result.current.linkError).toBe("wrong_password");
    expect(registerLocalVault).not.toHaveBeenCalled();
  });

  it("reports an email of another account and changes nothing", async () => {
    registerLocalVault.mockRejectedValueOnce(new LinkRejectedError());
    const { result } = renderLink();

    await act(async () => {
      await result.current.linkAccount("alice@example.com", PASSWORD);
    });

    expect(result.current.linkError).toBe("rejected");
    expect(store.saveAccount).not.toHaveBeenCalled();
    expect(linkServer).not.toHaveBeenCalled();
  });

  it("ends the session of another account behind the email, and never attaches it", async () => {
    let signedIn = false;
    logout.mockImplementationOnce(async () => {
      signedIn = secretsStore.hasServerSession;
      return { ok: true };
    });
    registerLocalVault.mockRejectedValueOnce(new LinkAccountMismatchError([...serverSession]));
    const { result } = renderLink();

    await act(async () => {
      expect(await result.current.linkAccount("alice@example.com", PASSWORD)).toBe(false);
    });

    expect(result.current.linkError).toBe("rejected");
    expect(signedIn).toBe(true);
    expect(secretsStore.hasServerSession).toBe(false);
    expect(store.saveAccount).not.toHaveBeenCalled();
    expect(linkServer).not.toHaveBeenCalled();
  });

  it("counts as linked when only attaching the session fails (offline until the next sign-in)", async () => {
    linkServer.mockRejectedValueOnce(new Error("hkdf failed"));
    const { result } = renderLink();

    await act(async () => {
      expect(await result.current.linkAccount("alice@example.com", PASSWORD)).toBe(true);
    });

    expect(store.saveAccount).toHaveBeenCalled();
    expect(result.current.linkError).toBeUndefined();
  });

  it("reads a vault key past its first version as `failed`, before the server", async () => {
    store.vault.getVaults.mockResolvedValue([{ ...local.vaults[0]!, keyVersion: 2 }]);
    const { result } = renderLink();

    await act(async () => {
      await result.current.linkAccount("alice@example.com", PASSWORD);
    });

    expect(result.current.linkError).toBe("failed");
    expect(registerLocalVault).not.toHaveBeenCalled();
  });

  it("doesn't link a vault locked while the account was created", async () => {
    const registered = registerLocalVault.getMockImplementation()!;
    registerLocalVault.mockImplementationOnce(async (...args: unknown[]) => {
      secretsStore.lock();
      return await registered(...args);
    });
    const { result } = renderLink();

    await act(async () => {
      expect(await result.current.linkAccount("alice@example.com", PASSWORD)).toBe(false);
    });

    expect(result.current.linkError).toBe("failed");
    expect(store.saveAccount).not.toHaveBeenCalled();
    expect(linkServer).not.toHaveBeenCalled();
  });

  it("refuses a profile that isn't local", async () => {
    store.profile = { ...local.profile, mode: "linked", email: "a@b.c", userId: "u" };
    const { result } = renderLink();

    await act(async () => {
      await result.current.linkAccount("alice@example.com", PASSWORD);
    });

    expect(result.current.linkError).toBe("failed");
    expect(registerLocalVault).not.toHaveBeenCalled();
  });
});
