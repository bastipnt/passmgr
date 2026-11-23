import { SessionContext, SessionProvider } from "@repo/client";
import { createUserKeyPair, genKey, wrapAccountKey, wrapVaultKey } from "@repo/crypto";
import type { MemberVault } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { toBase64 } from "@repo/util";
import { act, renderHook } from "@testing-library/react";
import { type ReactNode, useContext } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no Worker: unlocking seeds it, locking wipes it.
vi.mock("@repo/crypto/services/decrypt-worker-service", () => ({
  decryptWorkerService: { init: vi.fn(), wipe: vi.fn() },
}));

const B64_32 = toBase64(new Uint8Array(32));

function keyring() {
  const accountKey = genKey();
  const vaults: MemberVault[] = [
    {
      ...wrapVaultKey(accountKey, genKey(), "0199a3c4-0000-7000-8000-00000000000a", 1),
      kind: "personal",
      role: "owner",
      encryptedMeta: B64_32,
      metaEncryptionNonce: B64_32,
      previousKeys: [],
    },
  ];
  return { accountKey, vaults, userKeyPair: createUserKeyPair(accountKey) };
}

function renderSession() {
  return renderHook(() => useContext(SessionContext), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SessionProvider>{children}</SessionProvider>
    ),
  });
}

beforeEach(() => secretsStore.lock());

describe("SessionProvider modes (ADR 0001 D2)", () => {
  it("is locked, without a mode, until the vault is unlocked", () => {
    const { result } = renderSession();
    expect(result.current.vaultUnlocked).toBe(false);
    expect(result.current.mode).toBeUndefined();
  });

  it("a local profile is `local`, whatever the server session", async () => {
    const { result } = renderSession();
    const { accountKey, vaults, userKeyPair } = keyring();

    act(() => result.current.unlockWithAccountKey("local", accountKey, vaults, userKeyPair));
    expect(result.current.mode).toBe("local");

    await act(() => result.current.attachServer("sid", genKey(), genKey()));
    expect(result.current.mode).toBe("local");
  });

  it("a linked profile is `offline` without a server session and `online` with one", async () => {
    const { result } = renderSession();
    const { accountKey, vaults, userKeyPair } = keyring();

    act(() => result.current.unlockWithAccountKey("linked", accountKey, vaults, userKeyPair));
    expect(result.current.vaultUnlocked).toBe(true);
    expect(result.current.mode).toBe("offline");

    await act(() => result.current.attachServer("sid", genKey(), genKey()));
    expect(result.current.mode).toBe("online");
  });

  it("detaching the server keeps the vault unlocked: `online` → `offline`", async () => {
    const { result } = renderSession();
    const { accountKey, vaults, userKeyPair } = keyring();
    await act(() => result.current.attachServer("sid", genKey(), genKey()));
    act(() => result.current.unlockWithAccountKey("linked", accountKey, vaults, userKeyPair));
    expect(result.current.mode).toBe("online");

    act(() => result.current.detachServer());

    expect(result.current.mode).toBe("offline");
    expect(result.current.vaultUnlocked).toBe(true);
    expect(secretsStore.hasServerSession).toBe(false);
    expect(secretsStore.isVaultUnlocked).toBe(true);
  });

  it("lock wipes the keys and the server session", async () => {
    const { result } = renderSession();
    const { accountKey, vaults, userKeyPair } = keyring();
    await act(() => result.current.attachServer("sid", genKey(), genKey()));
    act(() => result.current.unlockWithAccountKey("linked", accountKey, vaults, userKeyPair));

    act(() => result.current.lock());

    expect(result.current.vaultUnlocked).toBe(false);
    expect(result.current.mode).toBeUndefined();
    expect(secretsStore.isVaultUnlocked).toBe(false);
    expect(secretsStore.hasServerSession).toBe(false);
  });

  it("restores a local profile without a server session, even if the bundle has one", () => {
    const { result } = renderSession();
    const { accountKey, vaults, userKeyPair } = keyring();

    act(() =>
      result.current.restoreLogin(
        "local",
        {
          accountKeyB64: toBase64(accountKey),
          server: { sessionId: "sid", authKeyB64: B64_32, authSaltB64: B64_32 },
        },
        vaults,
        userKeyPair,
      ),
    );

    expect(result.current.mode).toBe("local");
    expect(secretsStore.hasServerSession).toBe(false);
  });
});

describe("SessionProvider unlockVault and the OPAQUE password", () => {
  function renderTracked() {
    const renders: { unlocked: boolean; opaquePassword: boolean }[] = [];
    const hook = renderHook(
      () => {
        const session = useContext(SessionContext);
        renders.push({
          unlocked: session.vaultUnlocked,
          opaquePassword: secretsStore.hasOpaquePassword,
        });
        return session;
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <SessionProvider>{children}</SessionProvider>
        ),
      },
    );
    return { ...hook, renders };
  }

  it("holds the password it is given from the first unlocked render on (the enroll redirect)", () => {
    const { result, renders } = renderTracked();
    const { accountKey, vaults, userKeyPair } = keyring();
    const kek = genKey();
    const [encrypted, nonce] = wrapAccountKey(kek, accountKey);
    const opaquePassword = genKey();

    act(() =>
      result.current.unlockVault(
        "linked",
        kek,
        encrypted,
        nonce,
        vaults,
        userKeyPair,
        opaquePassword,
      ),
    );

    const unlockedRenders = renders.filter((r) => r.unlocked);
    expect(unlockedRenders.length).toBeGreaterThan(0);
    expect(unlockedRenders.every((r) => r.opaquePassword)).toBe(true);
    expect(secretsStore.copyOpaquePassword()).toEqual(opaquePassword);
  });

  it("keeps nothing when the unlock fails", () => {
    const { result } = renderTracked();
    const { accountKey, vaults, userKeyPair } = keyring();
    const [encrypted, nonce] = wrapAccountKey(genKey(), accountKey);

    expect(() =>
      result.current.unlockVault(
        "linked",
        genKey(),
        encrypted,
        nonce,
        vaults,
        userKeyPair,
        genKey(),
      ),
    ).toThrow();
    expect(secretsStore.hasOpaquePassword).toBe(false);
    expect(result.current.vaultUnlocked).toBe(false);
  });
});
