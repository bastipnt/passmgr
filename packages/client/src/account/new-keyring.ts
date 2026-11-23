import { createKeyring } from "@repo/crypto";
import { deriveArgon2InWorker } from "../util/derive-password-kek";
import { devicePasswordKekParams } from "./password-kek-params";

/**
 * A complete new keyring (`createKeyring`) with this device's password KEK
 * params, derived in the Argon2 worker. Shared by registration and local vault
 * creation, so a local vault can later be linked to an account as it is.
 */
export async function generateKeyring(password: string) {
  return createKeyring(password, await devicePasswordKekParams(), deriveArgon2InWorker);
}
