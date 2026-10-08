import { normalizeEmail, unwrapAccountKey, wipe } from "@repo/crypto";
import type { AccountKeyMaterial } from "@repo/schema";
import { type LocalProfile, secretsStore } from "@repo/store";
import { useCallback, useContext, useState } from "react";
import {
  LinkAccountMismatchError,
  type LinkedAccount,
  LinkRejectedError,
  localVaultKeyring,
  registerLocalVault,
} from "../account/link-local-vault";
import { LoginThrottledError } from "../login";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { RegistrationFinishFailedError, RegistrationStartFailedError } from "../register";
import { derivePasswordKek } from "../util/derive-password-kek";
import { endServerSession } from "../util/end-server-session";
import { persistSession } from "../util/persist-session";
import { useTRPCClient } from "../util/trpc";

/**
 * - `wrong_password`: the password doesn't open this vault
 * - `registration_failed`: the server refused the account (e.g. registration
 *   needs an invite) or couldn't be reached
 * - `rejected`: the email belongs to another account
 * - `throttled`: too many login attempts, retry later
 * - `unreachable`: the login after the registration didn't get through; the
 *   account may exist, linking again finishes it
 * - `failed`: no unlocked local vault to link, it was locked meanwhile, or
 *   storing the link failed
 */
export type LinkAccountError =
  | "wrong_password"
  | "registration_failed"
  | "rejected"
  | "throttled"
  | "unreachable"
  | "failed";

/**
 * Create an online account from the unlocked local vault (ADR 0001 D9), with
 * the same password and the vault's own keys: nothing is re-encrypted and the
 * recovery key stays valid. The profile becomes `linked` and goes online; its
 * first sync uploads every vault's records with their history (the outbox
 * holds all of it), and an interrupted upload resumes with the next sync.
 */
export function useLinkAccount() {
  const [linkError, setLinkError] = useState<LinkAccountError>();
  const [linking, setLinking] = useState(false);
  const { linkServer } = useContext(SessionContext);
  const store = useStore();
  const trpc = useTRPCClient();

  /** `invite`: needed when the server has registration disabled. Resolves whether it worked. */
  async function linkAccount(email: string, password: string, invite?: string): Promise<boolean> {
    setLinkError(undefined);
    setLinking(true);
    try {
      const error = await link(normalizeEmail(email), password, invite || undefined);
      setLinkError(error);
      return error === undefined;
    } finally {
      setLinking(false);
    }
  }

  async function link(
    email: string,
    password: string,
    invite: string | undefined,
  ): Promise<LinkAccountError | undefined> {
    const epoch = secretsStore.lockEpoch;
    const active = store.current();
    const material = active?.accountKeyMaterial;
    if (!secretsStore.isVaultUnlocked || active?.profile?.mode !== "local" || !material)
      return "failed";
    const { profileId } = active.entry;

    if (!(await opensAccountKey(password, material))) return "wrong_password";

    let keyring: ReturnType<typeof localVaultKeyring>;
    try {
      const recovery = await active.vault.getRecoveryKeyMaterial();
      if (!recovery) return "failed";
      keyring = localVaultKeyring(material, recovery, await active.vault.getVaults());
    } catch (e) {
      console.error("Reading the local vault's keys failed", e);
      return "failed";
    }

    let linked: LinkedAccount;
    try {
      linked = await registerLocalVault(trpc, email, password, keyring, invite);
    } catch (e) {
      if (e instanceof LinkAccountMismatchError) await endForeignSession(e.session);
      return linkFailure(e);
    }

    // Locked or switched meanwhile: the account exists, linking again finishes it.
    if (secretsStore.lockEpoch !== epoch || store.current()?.entry.profileId !== profileId)
      return "failed";
    const { info, session } = linked;
    // Another profile on this device is that account already: the registry holds it once.
    if (store.profiles.some((p) => p.userId === info.userId && p.profileId !== profileId)) {
      console.error("This device has a profile for the account already");
      return "failed";
    }

    const profile: LocalProfile = { profileId, mode: "linked", email, userId: info.userId };
    try {
      // The server's copy of the keyring this vault just uploaded: the same wraps.
      await store.saveAccount(
        profileId,
        { ...info.userPasswordKeys, userKeyPair: info.userKeyPair },
        info.vaultKeys,
        profile,
      );
    } catch (e) {
      console.error("Linking the local vault failed", e);
      return "failed";
    }
    try {
      // Online from here on: the sync uploads the outbox.
      await linkServer(...session);
    } catch (e) {
      // Linked all the same: `offline` until the next sign-in, which uploads it then.
      console.error("Attaching the new account's session failed", e);
    }
    await persistSession(profileId);
    return undefined;
  }

  /**
   * End the session of an account that turned out not to be this vault's
   * (best-effort). Its keys sit in memory only for the logout request: a
   * `local` profile has no session of its own, and the mode stays `local`, so
   * no sync ever runs with it.
   */
  async function endForeignSession(session: LinkAccountMismatchError["session"]) {
    if (secretsStore.hasServerSession) return;
    try {
      await secretsStore.unlockSession(...session);
      await endServerSession(trpc);
    } catch (e) {
      console.error("Ending the other account's session failed", e);
    } finally {
      secretsStore.detachServer();
    }
  }

  /** Hide a previous attempt's error, e.g. when the form opens again. */
  const clearLinkError = useCallback(() => setLinkError(undefined), []);

  return { linkAccount, linkError, clearLinkError, linking };
}

/** Whether the password opens the stored password wrap (ADR 0001 D9: verified locally first). */
async function opensAccountKey(password: string, material: AccountKeyMaterial): Promise<boolean> {
  let kek: Uint8Array | undefined;
  try {
    kek = await derivePasswordKek(password, material);
    wipe(unwrapAccountKey(kek, material.encryptedAccountKey, material.accountKeyEncryptionNonce));
    return true;
  } catch {
    return false;
  } finally {
    if (kek) wipe(kek);
  }
}

function linkFailure(e: unknown): LinkAccountError {
  if (e instanceof LoginThrottledError) return "throttled";
  if (e instanceof RegistrationStartFailedError || e instanceof RegistrationFinishFailedError)
    return "registration_failed";
  if (e instanceof LinkRejectedError || e instanceof LinkAccountMismatchError) return "rejected";
  console.error("Creating the online account failed", e);
  return "unreachable";
}
