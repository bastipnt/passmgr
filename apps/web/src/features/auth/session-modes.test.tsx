import { SessionContext, SessionProvider } from "@repo/client";
import { createUserKeyPair, genKey, wrapVaultKey } from "@repo/crypto";
import type { MemberVault } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { toBase64 } from "@repo/util";
import { act, renderHook } from "@testing-library/react";
import { type ReactNode, useContext } from "react";
import { beforeEach, describe, expect, it } from "vitest";

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

    await act(() => result.current.attachServer("sid", "session-key", genKey()));
    expect(result.current.mode).toBe("local");
  });

  it("a linked profile is `offline` without a server session and `online` with one", async () => {
    const { result } = renderSession();
    const { accountKey, vaults, userKeyPair } = keyring();

    act(() => result.current.unlockWithAccountKey("linked", accountKey, vaults, userKeyPair));
    expect(result.current.vaultUnlocked).toBe(true);
    expect(result.current.mode).toBe("offline");

    await act(() => result.current.attachServer("sid", "session-key", genKey()));
    expect(result.current.mode).toBe("online");
  });

  it("detaching the server keeps the vault unlocked: `online` → `offline`", async () => {
    const { result } = renderSession();
    const { accountKey, vaults, userKeyPair } = keyring();
    await act(() => result.current.attachServer("sid", "session-key", genKey()));
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
    await act(() => result.current.attachServer("sid", "session-key", genKey()));
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
