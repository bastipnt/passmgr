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
    () => argon2WorkerService.derive(password, fromBase64(keys.passwordKekSalt), passwordKekParams),
  );
}
