import { type DeriveArgon2, normalizePassword, unwrapAccountKey, wipe } from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import type { PasswordKeySchema } from "@repo/schema";
import { fromBase64 } from "@repo/util";
import { timed } from "./perf";

/** The password KEK of a stored password wrap, derived in the Argon2 worker. */
export async function derivePasswordKek(
  password: string,
  keys: PasswordKeySchema,
): Promise<Uint8Array> {
  const { passwordKekParams } = keys;
  return await timed(
    `argon2 derive (t:${passwordKekParams.t} m:${passwordKekParams.m} p:${passwordKekParams.p})`,
    () =>
      argon2WorkerService.derive(
        normalizePassword(password),
        fromBase64(keys.passwordKekSalt),
        passwordKekParams,
      ),
  );
}

/** The account key from a stored password wrap. Throws on a wrong password. */
export async function unwrapAccountKeyWithPassword(
  password: string,
  keys: PasswordKeySchema,
): Promise<Uint8Array> {
  const passwordKek = await derivePasswordKek(password, keys);
  try {
    return unwrapAccountKey(passwordKek, keys.encryptedAccountKey, keys.accountKeyEncryptionNonce);
  } finally {
    wipe(passwordKek);
  }
}

/** `genPasswordKek`'s `derive` (it passes the normalised password) in the worker. */
export const deriveArgon2InWorker: DeriveArgon2 = (password, salt, params) =>
  argon2WorkerService.derive(password, salt, params);
