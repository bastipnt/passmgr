import {
  type DeriveArgon2,
  type PasswordForm,
  passwordInForm,
  unwrapAccountKey,
  wipe,
  withPasswordForms,
} from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import type { PasswordKeySchema } from "@repo/schema";
import { fromBase64 } from "@repo/util";
import { timed } from "./perf";

/** The password KEK of a stored password wrap, derived in the Argon2 worker. */
export async function derivePasswordKek(
  password: string,
  keys: PasswordKeySchema,
  form: PasswordForm = "nfkc",
): Promise<Uint8Array> {
  const { passwordKekParams } = keys;
  return await timed(
    `argon2 derive (t:${passwordKekParams.t} m:${passwordKekParams.m} p:${passwordKekParams.p})`,
    () =>
      argon2WorkerService.derive(
        passwordInForm(password, form),
        fromBase64(keys.passwordKekSalt),
        passwordKekParams,
      ),
  );
}

/**
 * Open a stored password wrap: `open` gets the KEK (wiped afterwards), first of
 * the password's NFKC form, then of the form as typed (a wrap from before NFKC,
 * `withPasswordForms`). Resolves what `open` returned and the form that
 * opened it; throws when neither does.
 */
export async function openWithPassword<T>(
  password: string,
  keys: PasswordKeySchema,
  open: (passwordKek: Uint8Array) => T | Promise<T>,
): Promise<{ result: T; form: PasswordForm }> {
  return await withPasswordForms(password, async (form) => {
    const passwordKek = await derivePasswordKek(password, keys, form);
    try {
      return { result: await open(passwordKek), form };
    } finally {
      wipe(passwordKek);
    }
  });
}

/** The account key from a stored password wrap (`openWithPassword`). Throws on a wrong password. */
export async function unwrapAccountKeyWithPassword(
  password: string,
  keys: PasswordKeySchema,
): Promise<Uint8Array> {
  const { result } = await openWithPassword(password, keys, (kek) =>
    unwrapAccountKey(kek, keys.encryptedAccountKey, keys.accountKeyEncryptionNonce),
  );
  return result;
}

/** `genPasswordKek`'s `derive` (it passes the NFKC form) in the worker. */
export const deriveArgon2InWorker: DeriveArgon2 = (password, salt, params) =>
  argon2WorkerService.derive(password, salt, params);
