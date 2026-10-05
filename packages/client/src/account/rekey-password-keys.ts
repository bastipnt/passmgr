import { genPasswordKek, getPasswordKekParams, wipe } from "@repo/crypto";
import type { AccountKeyMaterial, ArgonParams } from "@repo/schema";
import { secretsStore } from "@repo/store";
import type { AppRouter } from "@repo/types";
import { toBase64 } from "@repo/util";
import type { TRPCClient } from "@trpc/client";
import { timed } from "../util/perf";

export function paramsEqual(a: ArgonParams, b: ArgonParams): boolean {
  return a.t === b.t && a.m === b.m && a.p === b.p;
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
  const targetParams = getPasswordKekParams();
  if (paramsEqual(material.passwordKekParams, targetParams)) return;
  if (!secretsStore.hasServerSession) return;

  try {
    const { passwordKek, passwordKekParams, passwordKekSaltData } = await timed(
      `argon2 rekey (t:${targetParams.t} m:${targetParams.m} p:${targetParams.p})`,
      () => genPasswordKek(password, targetParams),
    );

    const [encryptedAccountKey, accountKeyEncryptionNonce] =
      secretsStore.rewrapAccountKey(passwordKek);
    wipe(passwordKek);

    const updated = {
      passwordKekParams,
      passwordKekSalt: toBase64(passwordKekSaltData),
      encryptedAccountKey,
      accountKeyEncryptionNonce,
    };
    await trpc.user.rekeyPasswordKeys.mutate(updated);
    return { ...updated, userKeyPair: material.userKeyPair };
  } catch (e) {
    console.error("Argon2 param rekey failed (will retry next login)", e);
  }
}
