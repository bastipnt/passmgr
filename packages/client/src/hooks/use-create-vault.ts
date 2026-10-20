import { wipe } from "@repo/crypto";
import { useEffect, useRef, useState } from "react";
import { useCreateLocalVault } from "./use-create-local-vault";
import { useLinkAccount } from "./use-link-account";

/** A recovery key to show once; hand it back to `recoveryKeySaved` afterwards. */
export type NewRecoveryKey = {
  recoveryKey: Uint8Array;
  /** The account it belongs to, when the vault was linked to one. */
  email?: string;
  /** The vault opens once the key is saved, not before. */
  unlockOnSave?: boolean;
};

/**
 * Create a vault, optionally with an account to sync it. It is always created
 * on this device first (ADR 0001 D2) and then linked (D9): a failed server step
 * leaves a working local vault, and the recovery key stays valid either way.
 *
 * `onOpening` runs right before the vault unlocks ahead of its recovery key
 * (linking needs it open), e.g. to keep the screen from leaving.
 */
export function useCreateVault({ onOpening }: { onOpening?: () => void } = {}) {
  const { createLocalVault, finishLocalVault, createError } = useCreateLocalVault();
  const { linkAccount, linkError, clearLinkError } = useLinkAccount();
  const [created, setCreated] = useState(false);
  const [opened, setOpened] = useState(false);
  const [keyPending, setKeyPending] = useState(false);
  const recoveryKey = useRef<Uint8Array>(undefined);

  useEffect(
    () => () => {
      if (recoveryKey.current) wipe(recoveryKey.current);
    },
    [],
  );

  async function create(password: string, name: string) {
    const key = await createLocalVault(password, name);
    if (key) {
      recoveryKey.current = key;
      setCreated(true);
      setKeyPending(true);
    }
    return key;
  }

  /** Resolves whether the vault is open; one that was created but didn't open never is. */
  async function open(password: string, name: string): Promise<NewRecoveryKey | boolean> {
    if (opened) return true;
    if (created) return false;
    const key = await create(password, name);
    if (!key) return false;
    onOpening?.();
    if (await finishLocalVault()) {
      setOpened(true);
      return true;
    }
    // Created but not opened: the key is still the only way back in.
    return { recoveryKey: key };
  }

  /** A vault on this device only (or the one already open, when linking failed). */
  async function keepLocal(password: string, name: string): Promise<NewRecoveryKey | undefined> {
    if (opened) return recoveryKey.current && { recoveryKey: recoveryKey.current };
    if (created) return;
    const key = await create(password, name);
    return key && { recoveryKey: key, unlockOnSave: true };
  }

  /** `undefined`: nothing to show yet, `linkError` / `createError` say why. */
  async function createAccount(
    password: string,
    name: string,
    email: string,
    invite?: string,
  ): Promise<NewRecoveryKey | undefined> {
    const isOpen = await open(password, name);
    if (isOpen !== true) return isOpen || undefined;
    if (!(await linkAccount(email, password, invite)) || !recoveryKey.current) return;
    return { recoveryKey: recoveryKey.current, email };
  }

  /** After the key was shown (the dialog wipes it): opens a vault created local only. */
  async function recoveryKeySaved(shown: NewRecoveryKey) {
    recoveryKey.current = undefined;
    setKeyPending(false);
    if (shown.unlockOnSave) await finishLocalVault();
  }

  return {
    keepLocal,
    createAccount,
    recoveryKeySaved,
    /** Created: its password can no longer change. */
    created,
    /** A recovery key not shown and saved yet. */
    keyPending,
    createError,
    linkError,
    clearLinkError,
  };
}
