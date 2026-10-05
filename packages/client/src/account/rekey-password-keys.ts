import { genSalt, getPasswordKekParams, wipe } from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import type { AccountKeyMaterial, ArgonParams } from "@repo/schema";
import { secretsStore } from "@repo/store";
import type { AppRouter } from "@repo/types";
import { toBase64 } from "@repo/util";
import type { TRPCClient } from "@trpc/client";
import { timed } from "../util/perf";

export function paramsEqual(a: ArgonParams, b: ArgonParams): boolean {
  return a.t === b.t && a.m === b.m && a.p === b.p;
}

type PasswordWrap = Omit<AccountKeyMaterial, "userKeyPair">;

/** The account key rewrapped under a KEK derived with the current Argon2 params. */
async function rewrapWithCurrentParams(password: string): Promise<PasswordWrap> {
  const passwordKekParams = getPasswordKekParams();
  const passwordKekSaltData = genSalt();
  // In the worker (native: off the JS thread): the unlock this follows stays responsive.
  const passwordKek = await timed(
    `argon2 rekey (t:${passwordKekParams.t} m:${passwordKekParams.m} p:${passwordKekParams.p})`,
    () => argon2WorkerService.derive(password, passwordKekSaltData, passwordKekParams),
  );
  try {
    const [encryptedAccountKey, accountKeyEncryptionNonce] =
      secretsStore.rewrapAccountKey(passwordKek);
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
 * Re-derive the password KEK with the current Argon2 params and re-wrap the
 * account key (vault keys are unaffected), when the stored params are stale
 * (e.g. after a params bump). Runs client-side only — the server never sees
 * the key or password. Needs the unlocked account key and a server session
 * (ADR 0001 D10: a linked profile never rekeys offline, or the local and server
 * key sets would diverge).
 *
 * @returns the rewrapped material to cache locally, or undefined when nothing
 * changed. Best-effort: failures are logged and retried at the next login.
 */
export async function rekeyIfParamsStale(
  trpc: Pick<TRPCClient<AppRouter>, "user">,
  password: string,
  material: AccountKeyMaterial,
): Promise<AccountKeyMaterial | undefined> {
  if (paramsEqual(material.passwordKekParams, getPasswordKekParams())) return;
  if (!secretsStore.hasServerSession) return;

  try {
    const updated = await rewrapWithCurrentParams(password);
    await trpc.user.rekeyPasswordKeys.mutate(updated);
    return { ...updated, userKeyPair: material.userKeyPair };
  } catch (e) {
    console.error("Argon2 param rekey failed (will retry next login)", e);
  }
}

/**
 * The same rekey for a `local` profile (ADR 0001 D10): the device holds the
 * only copy of the key set, so no server is involved. Only the password wrap
 * changes; the recovery wrap stays.
 */
export async function rekeyLocalIfParamsStale(
  password: string,
  material: AccountKeyMaterial,
): Promise<AccountKeyMaterial | undefined> {
  if (paramsEqual(material.passwordKekParams, getPasswordKekParams())) return;

  try {
    const updated = await rewrapWithCurrentParams(password);
    return { ...updated, userKeyPair: material.userKeyPair };
  } catch (e) {
    console.error("Argon2 param rekey failed (will retry next unlock)", e);
  }
}
