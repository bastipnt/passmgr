import * as opaque from "@serenity-kit/opaque";
import { useTRPCClient } from "./util/trpc";
import { useState } from "react";
import {
  encryptXChaCha,
  genKey,
  genPasswordKek,
  genSalt,
  hkdf,
  toBase64,
  wipe,
} from "@repo/crypto";
import type { UserKeySchema } from "@repo/schema";

export function useRegistration() {
  const trpc = useTRPCClient();
  const [registrationError, setRegistrationError] = useState(false);

  async function registerNewUser(email: string, password: string) {
    const { clientRegistrationState, registrationRequest } = opaque.client.startRegistration({
      password,
    });

    let registrationResponse: string;

    try {
      ({ registrationResponse } = await trpc.register.startRegistration.mutate({
        email,
        registrationRequest,
      }));
    } catch (error) {
      console.log(error);
      setRegistrationError(true);
      return;
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
    } catch (error) {
      console.log(error);
      setRegistrationError(true);
      return;
    }

    // TODO: show to user
    console.log({ recoveryKey });
  }

  async function generateUserKeys(
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
      // ⚠️ only show to user never sent to backend
      recoveryKey,
      // ⚠️

      recoveryKekSalt,

      passwordKekParams,
      passwordKekSalt,

      encryptedVaultKey,
      vaultKeyEncryptionNonce,

      encryptedVaultKeyRecovery,
      vaultKeyEncryptionNonceRecovery,
    };
  }

  return { registerNewUser, registrationError };
}
