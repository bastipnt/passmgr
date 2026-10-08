import { OpaqueClient, type RegistrationClient, RegistrationResponse } from "@cloudflare/opaque-ts";
import { normalizeEmail, wipe } from "@repo/crypto";
import { opaqueKsf } from "@repo/crypto/services/opaque-ksf";
import type { FinishRegistrationInput } from "@repo/schema";
import type { AppRouter } from "@repo/types";
import type { TRPCClient } from "@trpc/client";
import { generateKeyring } from "./account/new-keyring";
import { b64ToBytes, bytesToB64, opaqueConfig as config, SERVER_IDENTITY } from "./opaque";

export type RegistrationTRPCClient = Pick<TRPCClient<AppRouter>, "register">;

export class RegistrationStartFailedError extends Error {
  override message = "RegistrationStartFailedError";
}

export class RegistrationFinishFailedError extends Error {
  override message = "RegistrationFinishFailedError";
}

/** What `finishRegistration` stores: the key set, the personal vault, the keypair, other vaults. */
export type RegistrationKeyring = Pick<
  FinishRegistrationInput,
  "userKeys" | "personalVault" | "userKeyPair" | "vaults"
>;

/**
 * Drive a full OPAQUE registration handshake + key derivation: a new account
 * key, wrapped under the password and a fresh recovery key, plus the personal
 * vault key and the X25519 private key, both wrapped under the account key.
 *
 * Throws RegistrationStartFailedError or RegistrationFinishFailedError on tRPC failure;
 * on the finish-failure path the recoveryKey buffer has already been wiped.
 *
 * @param invite one-time invite code; required when the server has registration disabled
 * @returns the recoveryKey (must be shown to the user exactly once and never sent to the server)
 */
export async function registerNewUser(
  trpc: RegistrationTRPCClient,
  rawEmail: string,
  password: string,
  invite?: string,
): Promise<Uint8Array> {
  let recoveryKey: Uint8Array | undefined;
  try {
    // Derived once the server took the request: a refused one costs no Argon2.
    await registerAccount(
      trpc,
      rawEmail,
      password,
      async () => {
        // Only its wraps leave this function.
        const { accountKey, recoveryKey: key, ...keyring } = await generateKeyring(password);
        wipe(accountKey);
        recoveryKey = key;
        return keyring;
      },
      invite,
    );
  } catch (e) {
    if (recoveryKey) wipe(recoveryKey);
    throw e;
  }
  if (!recoveryKey) throw new RegistrationFinishFailedError();
  return recoveryKey;
}

/**
 * The OPAQUE registration for `email` + `password`, storing the keyring
 * `getKeyring` resolves on the server as the account's keys: a new one
 * (`registerNewUser`) or a local vault's (linking, ADR 0001 D9). It's asked
 * for only once the server answered the registration request. Like the server, it doesn't tell whether the
 * email was taken: an account that exists already is left as it is.
 *
 * Throws RegistrationStartFailedError or RegistrationFinishFailedError.
 */
export async function registerAccount(
  trpc: RegistrationTRPCClient,
  rawEmail: string,
  password: string,
  getKeyring: () => RegistrationKeyring | Promise<RegistrationKeyring>,
  invite?: string,
): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const client: RegistrationClient = new OpaqueClient(config, opaqueKsf);

  const req = await client.registerInit(password);
  if (req instanceof Error) throw new RegistrationStartFailedError();

  const registrationRequest = bytesToB64(req.serialize());

  let registrationResponse: string;
  try {
    ({ registrationResponse } = await trpc.register.startRegistration.mutate({
      email,
      registrationRequest,
      invite,
    }));
  } catch {
    throw new RegistrationStartFailedError();
  }

  let resp: RegistrationResponse;
  try {
    resp = RegistrationResponse.deserialize(config, b64ToBytes(registrationResponse));
  } catch {
    throw new RegistrationStartFailedError();
  }

  // server_identity / client_identity bind the envelope MAC. Must match the
  // server's authInit call at login time.
  const finished = await client.registerFinish(resp, SERVER_IDENTITY, email);
  if (finished instanceof Error) throw new RegistrationFinishFailedError();

  const registrationRecord = bytesToB64(finished.record.serialize());
  const keyring = await getKeyring();

  try {
    await trpc.register.finishRegistration.mutate({
      email,
      registrationRecord,
      ...keyring,
      invite,
    });
  } catch {
    throw new RegistrationFinishFailedError();
  }
}
