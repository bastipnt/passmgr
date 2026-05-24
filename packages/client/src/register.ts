import {
  OpaqueClient,
  OpaqueID,
  RegistrationResponse,
  getOpaqueConfig,
  type RegistrationClient,
} from "@cloudflare/opaque-ts";
import type { TRPCClient } from "@trpc/client";
import { encryptXChaCha, genKey, genPasswordKek, genSalt, hkdf, wipe } from "@repo/crypto";
import { opaqueKsf } from "@repo/crypto/services/opaque-ksf";
import { fromBase64, toBase64 } from "@repo/util";
import type { AppRouter } from "@repo/types";
import type { UserKeySchema } from "@repo/schema";

export type RegistrationTRPCClient = Pick<TRPCClient<AppRouter>, "register">;

export class RegistrationStartFailedError extends Error {
  override message = "RegistrationStartFailedError";
}

export class RegistrationFinishFailedError extends Error {
  override message = "RegistrationFinishFailedError";
}

const config = getOpaqueConfig(OpaqueID.OPAQUE_P256);
// Must match OPAQUE_SERVER_IDENTITY on the server (default "passmgr").
const SERVER_IDENTITY = "passmgr";

function bytesToB64(bytes: number[]): string {
  return toBase64(Uint8Array.from(bytes));
}

function b64ToBytes(s: string): number[] {
  return Array.from(fromBase64(s));
}

/**
 * Drive a full OPAQUE registration handshake + key derivation.
 *
 * Throws RegistrationStartFailedError or RegistrationFinishFailedError on tRPC failure;
 * on the finish-failure path the recoveryKey buffer has already been wiped.
 *
 * @returns the recoveryKey (must be shown to the user exactly once and never sent to the server)
 */
export async function registerNewUser(
  trpc: RegistrationTRPCClient,
  email: string,
  password: string,
): Promise<Uint8Array> {
  const client: RegistrationClient = new OpaqueClient(config, opaqueKsf);

  const req = await client.registerInit(password);
  if (req instanceof Error) throw new RegistrationStartFailedError();

  const registrationRequest = bytesToB64(req.serialize());

  let registrationResponse: string;
  try {
    ({ registrationResponse } = await trpc.register.startRegistration.mutate({
      email,
      registrationRequest,
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

  const { recoveryKey, ...userKeys } = await generateUserKeys(password);

  try {
    await trpc.register.finishRegistration.mutate({
      email,
      registrationRecord,
      userKeys,
    });
  } catch {
    wipe(recoveryKey);
    throw new RegistrationFinishFailedError();
  }

  return recoveryKey;
}

export async function generateUserKeys(
  password: string,
): Promise<UserKeySchema & { recoveryKey: Uint8Array }> {
  const recoveryKey = genKey();
  const recoveryKekSaltData = genSalt();

  const { passwordKek, passwordKekParams, passwordKekSaltData } = await genPasswordKek(password);
  const recoveryKek = await hkdf(recoveryKey, "recoveryRootKey", recoveryKekSaltData);
  const vaultKey = genKey();

  const [encryptedVaultKey, vaultKeyEncryptionNonce] = encryptXChaCha(passwordKek, vaultKey);
  const [encryptedVaultKeyRecovery, vaultKeyEncryptionNonceRecovery] = encryptXChaCha(
    recoveryKek,
    vaultKey,
  );

  const recoveryKekSalt = toBase64(recoveryKekSaltData);
  wipe(recoveryKekSaltData);

  const passwordKekSalt = toBase64(passwordKekSaltData);
  wipe(passwordKekSaltData);

  wipe(vaultKey);

  return {
    // only show to user, never sent to backend
    recoveryKey,

    recoveryKekSalt,

    passwordKekParams,
    passwordKekSalt,

    encryptedVaultKey,
    vaultKeyEncryptionNonce,

    encryptedVaultKeyRecovery,
    vaultKeyEncryptionNonceRecovery,
  };
}
