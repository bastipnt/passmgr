import { genSalt, needsPasswordKekRekey, wipe, wrapAccountKey } from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import type { AccountKeyMaterial } from "@repo/schema";
import { secretsStore } from "@repo/store";
import type { AppRouter } from "@repo/types";
import { toBase64 } from "@repo/util";
import type { TRPCClient } from "@trpc/client";
import { timed } from "../util/perf";
import { devicePasswordKekParams } from "./password-kek-params";

export type PasswordWrap = Omit<AccountKeyMaterial, "userKeyPair">;

/**
 * The unlocked account key wrapped under `password`, with a fresh salt and the
 * device's Argon2 params (rekey, password change).
 */
export function wrapAccountKeyForPassword(password: string): Promise<PasswordWrap> {
  return derivePasswordWrap(password, (kek) => secretsStore.rewrapAccountKey(kek));
}

/** `wrapAccountKeyForPassword` for an account key that isn't unlocked (local recovery). */
export function wrapGivenAccountKeyForPassword(
  password: string,
  accountKey: Uint8Array,
): Promise<PasswordWrap> {
  return derivePasswordWrap(password, (kek) => wrapAccountKey(kek, accountKey));
}

async function derivePasswordWrap(
  password: string,
  wrap: (passwordKek: Uint8Array) => [encryptedAccountKey: string, nonce: string],
): Promise<PasswordWrap> {
  const passwordKekParams = await devicePasswordKekParams();
  const passwordKekSaltData = genSalt();
  // In the worker (native: off the JS thread): the unlock this follows stays responsive.
  const passwordKek = await timed(
    `argon2 rekey (t:${passwordKekParams.t} m:${passwordKekParams.m} p:${passwordKekParams.p})`,
    () => argon2WorkerService.derive(password, passwordKekSaltData, passwordKekParams),
  );
  try {
    const [encryptedAccountKey, accountKeyEncryptionNonce] = wrap(passwordKek);
    return {
      passwordKekParams,
      passwordKekSalt: toBase64(passwordKekSaltData),
      encryptedAccountKey,
      accountKeyEncryptionNonce,
    };
  } finally {
    wipe(passwordKek);
    wipe(passwordKekSaltData);
  }
}

/**
 * Re-derive the password KEK with this device's Argon2 params and re-wrap the
 * account key (vault keys are unaffected), when the stored params are below the
 * floor (`needsPasswordKekRekey`). Runs client-side only — the server never sees
 * the key or password. Needs the unlocked account key and a server session
 * (ADR 0001 D10: a linked profile never rekeys offline, or the local and server
 * key sets would diverge).
 *
 * @returns the rewrapped material to cache locally, or undefined when nothing
 * changed. Best-effort: failures are logged and retried at the next login.
 */
export async function rekeyIfBelowFloor(
  trpc: Pick<TRPCClient<AppRouter>, "user">,
  password: string,
  material: AccountKeyMaterial,
): Promise<AccountKeyMaterial | undefined> {
  if (!needsPasswordKekRekey(material.passwordKekParams)) return;
  if (!secretsStore.hasServerSession) return;

  try {
    const updated = await wrapAccountKeyForPassword(password);
    await trpc.user.rekeyPasswordKeys.mutate(updated);
    return { ...updated, userKeyPair: material.userKeyPair };
  } catch (e) {
    console.error("Argon2 floor rekey failed (will retry next login)", e);
  }
}

/**
 * The same rekey for a `local` profile (ADR 0001 D10): the device holds the
 * only copy of the key set, so no server is involved. Only the password wrap
 * changes; the recovery wrap stays.
 */
export async function rekeyLocalIfBelowFloor(
  password: string,
  material: AccountKeyMaterial,
): Promise<AccountKeyMaterial | undefined> {
  if (!needsPasswordKekRekey(material.passwordKekParams)) return;

  try {
    const updated = await wrapAccountKeyForPassword(password);
    return { ...updated, userKeyPair: material.userKeyPair };
  } catch (e) {
    console.error("Argon2 floor rekey failed (will retry next unlock)", e);
  }
}
