import { SessionContext, type SessionMode, useDeleteAccount } from "@repo/client";
import { WrongPasswordError } from "@repo/client/src/account/change-password";
import {
  AccountDeletionFailedError,
  AccountDeletionUnconfirmedError,
  SoleVaultOwnerError,
} from "@repo/client/src/account/delete-account";
import { LoginThrottledError } from "@repo/client/src/login";
import { type LocalProfile, secretsStore } from "@repo/store";
import { act, renderHook } from "@testing-library/react";
import type { ContextType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";

// Real hook; the store, the session, the lock and the server call are replaced.
const store = createFakeStore();
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => ({}),
}));
const lock = vi.hoisted(() => vi.fn());
vi.mock("@repo/client/src/hooks/use-lock", () => ({ useLock: () => lock }));
const deleteAccount = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@repo/client/src/account/delete-account", async (importActual) => ({
  ...(await importActual<object>()),
  deleteAccount,
}));

const PASSWORD = "hunter2hunter2";
const attachServer = vi.fn(async () => undefined);
const ALICE: LocalProfile = {
  profileId: "p-alice",
  mode: "linked",
  email: "alice@example.com",
  userId: "u-alice",
};

function renderDelete(mode: SessionMode, networkOffline = false) {
  const session = { mode, networkOffline, attachServer } as unknown as ContextType<
    typeof SessionContext
  >;
  return renderHook(() => useDeleteAccount(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    ),
  });
}

function useProfile(profile: LocalProfile) {
  store.profiles = [profileEntry(profile)];
  store.profile = profile;
}

beforeEach(() => {
  vi.clearAllMocks();
  useProfile(ALICE);
  vi.spyOn(secretsStore, "isVaultUnlocked", "get").mockReturnValue(true);
  vi.spyOn(secretsStore, "hasServerSession", "get").mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe("useDeleteAccount", () => {
  it("deletes the account with a fresh login, then removes the profile from the device", async () => {
    const { result } = renderDelete("online");

    await act(async () => {
      expect(await result.current.deleteAccount(PASSWORD)).toBe(true);
    });

    expect(deleteAccount).toHaveBeenCalledWith(
      expect.anything(),
      attachServer,
      ALICE,
      PASSWORD,
      expect.any(Function),
    );
    expect(lock).toHaveBeenCalled();
    expect(store.removeProfile).toHaveBeenCalledWith(ALICE.profileId);
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
      store.removeProfile.mock.invocationCallOrder[0]!,
    );
    expect(result.current.deleteError).toBeUndefined();
  });

  it.each([
    ["offline", false],
    ["online", true],
  ] as const)("is blocked while %s (network down: %s)", async (mode, networkOffline) => {
    const { result } = renderDelete(mode, networkOffline);
    expect(result.current.blocked).toBe(true);

    await act(async () => {
      expect(await result.current.deleteAccount(PASSWORD)).toBe(false);
    });

    expect(result.current.deleteError).toBe("offline");
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("never runs for a local vault", async () => {
    useProfile({ profileId: "p-local", mode: "local" } as LocalProfile);
    const { result } = renderDelete("online");

    await act(async () => {
      expect(await result.current.deleteAccount(PASSWORD)).toBe(false);
    });

    expect(result.current.deleteError).toBe("failed");
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it.each([
    [new WrongPasswordError(), "wrong_password"],
    [new LoginThrottledError(), "throttled"],
    [new SoleVaultOwnerError(["v-team"]), "sole_owner"],
    [new AccountDeletionUnconfirmedError(), "unconfirmed"],
    [new AccountDeletionFailedError(), "failed"],
  ] as const)("keeps the profile when the server says %s", async (error, expected) => {
    deleteAccount.mockRejectedValueOnce(error);
    const { result } = renderDelete("online");

    await act(async () => {
      expect(await result.current.deleteAccount(PASSWORD)).toBe(false);
    });

    expect(result.current.deleteError).toBe(expected);
    expect(lock).not.toHaveBeenCalled();
    expect(store.removeProfile).not.toHaveBeenCalled();
  });

  it("names the shared vaults to hand over first", async () => {
    deleteAccount.mockRejectedValueOnce(new SoleVaultOwnerError(["v-team", "v-family"]));
    const { result } = renderDelete("online");

    await act(async () => {
      await result.current.deleteAccount(PASSWORD);
    });

    expect(result.current.deleteError).toBe("sole_owner");
    expect(result.current.soleOwnedVaultIds).toEqual(["v-team", "v-family"]);
  });

  it("reads a failed login after an unanswered deletion as a likely deleted account", async () => {
    deleteAccount
      .mockRejectedValueOnce(new AccountDeletionUnconfirmedError())
      .mockRejectedValueOnce(new WrongPasswordError());
    const { result } = renderDelete("online");

    await act(async () => {
      await result.current.deleteAccount(PASSWORD);
    });
    expect(result.current.deleteError).toBe("unconfirmed");
    await act(async () => {
      await result.current.deleteAccount(PASSWORD);
    });
    expect(result.current.deleteError).toBe("maybe_deleted");
  });
});
