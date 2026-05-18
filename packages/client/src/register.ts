import * as opaque from "@serenity-kit/opaque";
import type { TRPCClient } from "@trpc/client";
import { encryptXChaCha, genKey, genPasswordKek, genSalt, hkdf, wipe } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import type { AppRouter } from "@repo/types";
import type { UserKeySchema } from "@repo/schema";

export type RegistrationTRPCClient = Pick<TRPCClient<AppRouter>, "register">;

export class RegistrationStartFailedError extends Error {
  override message = "RegistrationStartFailedError";
}

export class RegistrationFinishFailedError extends Error {
  override message = "RegistrationFinishFailedError";
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
  const { clientRegistrationState, registrationRequest } = opaque.client.startRegistration({
    password,
  });

  let registrationResponse: string;
  try {
    ({ registrationResponse } = await trpc.register.startRegistration.mutate({
      email,
      registrationRequest,
    }));
  } catch {
    throw new RegistrationStartFailedError();
  }

  const { registrationRecord } = opaque.client.finishRegistration({
    clientRegistrationState,
    registrationResponse,
    password,
  });

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
