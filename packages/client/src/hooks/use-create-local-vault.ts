import { wipe } from "@repo/crypto";
import type { MemberVault, UserKeyPair } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { generateLocalVault } from "../account/create-local-vault";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { initDecryptWorker } from "../util/decrypt-record";
import { persistSession } from "../util/persist-session";

/**
 * - `failed`: the key derivation or the local write failed (nothing was created)
 * - `unlock_failed`: the vault was created, but opening it afterwards failed;
 *   it unlocks with the password as usual
 */
export type CreateLocalVaultError = "failed" | "unlock_failed";

/** What the unlock after the recovery key needs; the account key is wiped if it never comes. */
type PendingUnlock = {
  accountKey: Uint8Array;
  vaults: MemberVault[];
  userKeyPair: UserKeyPair;
  /** Only while biometric enrollment comes next (a string can't be wiped). */
  password?: string;
  profileId: string;
};

/**
 * Create a vault on this device, with no server and no account (ADR 0001 D2,
 * `local` profile), as a new profile next to any others. Two steps, like a
 * registration:
 *
 * 1. `createLocalVault(password)` generates the keyring, stores it and resolves
 *    the recovery key, to be shown once (it never leaves the device).
 * 2. `finishLocalVault()`, once the user has saved it, unlocks the new vault
 *    with the account key still in memory: no second Argon2 derivation.
 */
export function useCreateLocalVault() {
  const [createError, setCreateError] = useState<CreateLocalVaultError>();
  const { unlockWithAccountKey } = useContext(SessionContext);
  const store = useStore();
  const pending = useRef<PendingUnlock | undefined>(undefined);

  // Leaving before the unlock (closing the page) must not leave the key behind.
  useEffect(() => () => dropPending(pending), []);

  /** `name` tells this vault apart from other profiles on the device (optional). */
  async function createLocalVault(
    password: string,
    name?: string,
  ): Promise<Uint8Array | undefined> {
    setCreateError(undefined);

    let created: Awaited<ReturnType<typeof generateLocalVault>>;
    try {
      created = await generateLocalVault(password);
    } catch (e) {
      console.error("Local vault key generation failed", e);
      setCreateError("failed");
      return;
    }

    const { accountKey, recoveryKey, material, recovery, vaults, profile } = created;
    try {
      await store.createLocalVault(material, recovery, vaults, profile, name);
    } catch (e) {
      console.error("Storing the local vault failed", e);
      wipe(accountKey);
      wipe(recoveryKey);
      setCreateError("failed");
      return;
    }

    dropPending(pending);
    const opened = store.current();
    pending.current = {
      accountKey,
      vaults,
      userKeyPair: material.userKeyPair,
      password: opened && store.needsBiometricEnrollFor(opened) ? password : undefined,
      profileId: profile.profileId,
    };
    return recoveryKey;
  }

  /** Unlock the vault created by `createLocalVault`. Resolves `false` when there is none. */
  const finishLocalVault = useCallback(async (): Promise<boolean> => {
    const next = pending.current;
    pending.current = undefined;
    if (!next) return false;

    try {
      // Takes over the account key buffer.
      unlockWithAccountKey("local", next.accountKey, next.vaults, next.userKeyPair);
    } catch (e) {
      console.error("Unlocking the new local vault failed", e);
      wipe(next.accountKey);
      setCreateError("unlock_failed");
      return false;
    }
    // Same tick as the unlock, so the enroll redirect already sees it.
    if (next.password !== undefined) secretsStore.setPassword(next.password);
    initDecryptWorker();
    await persistSession(next.profileId);
    return true;
  }, [unlockWithAccountKey]);

  return { createLocalVault, finishLocalVault, createError };
}

function dropPending(pending: { current: PendingUnlock | undefined }) {
  if (pending.current) wipe(pending.current.accountKey);
  pending.current = undefined;
}
