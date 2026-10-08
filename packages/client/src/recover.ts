import { OpaqueClient, type RegistrationClient, RegistrationResponse } from "@cloudflare/opaque-ts";
import {
  deriveRecoveryAuthKey,
  generateRecoveryKeys,
  generateUserKeys,
  normalizeEmail,
  unwrapAccountKeyWithRecoveryKey,
  unwrapVaultKey,
  wipe,
} from "@repo/crypto";
import { opaqueKsf } from "@repo/crypto/services/opaque-ksf";
import type {
  AccountKeyMaterial,
  MemberVault,
  RecoveryKeySchema,
  RecoveryWrapSchema,
} from "@repo/schema";
import type { AppRouter } from "@repo/types";
import { fromBase64, toBase64 } from "@repo/util";
import type { TRPCClient } from "@trpc/client";
import { wrapGivenAccountKeyForPassword } from "./account/rekey-password-keys";
import { LoginThrottledError } from "./login";
import { b64ToBytes, bytesToB64, opaqueConfig as config, SERVER_IDENTITY } from "./opaque";
import { isThrottled } from "./util/trpc-errors";

export type RecoveryTRPCClient = Pick<TRPCClient<AppRouter>, "recovery">;

/** The entered recovery key isn't a well-formed key (typo, truncated paste). */
export class RecoveryKeyInvalidError extends Error {
  override message = "RecoveryKeyInvalidError";
}

/**
 * The recovery key opens its wrap, but not to the key of this vault: the
 * stored key material is inconsistent. Nothing may be overwritten with it.
 */
export class LocalRecoveryMismatchError extends Error {
  override message = "LocalRecoveryMismatchError";
}

/** Wrong email / recovery key, expired attempt, or a server-side failure. */
export class RecoveryFailedError extends Error {
  override message = "RecoveryFailedError";
}

const RECOVERY_KEY_BYTES = 32;

/**
 * Parse a recovery key as displayed at registration (base64 of 32 bytes).
 * Whitespace is ignored so line-wrapped or spaced pastes still work.
 */
export function parseRecoveryKey(input: string): Uint8Array {
  const compact = input.replace(/\s+/g, "");
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(compact);
  } catch {
    throw new RecoveryKeyInvalidError();
  }
  if (bytes.length !== RECOVERY_KEY_BYTES) {
    wipe(bytes);
    throw new RecoveryKeyInvalidError();
  }
  return bytes;
}

/**
 * Reset the master password with the recovery key.
 *
 * Proves possession of the recovery key (HKDF-derived auth key, checked
 * against the server's verifier), unwraps the existing account key with it and
 * re-wraps that same key under the new password and a fresh recovery key. Vault
 * keys (wrapped by the account key) stay untouched, so all records stay
 * readable. The server swaps the OPAQUE record and key set and revokes every
 * existing session.
 *
 * @returns the new recoveryKey (show once, never send to the server; the
 *   old one no longer works)
 */
export async function recoverAccount(
  trpc: RecoveryTRPCClient,
  rawEmail: string,
  rawRecoveryKey: string,
  newPassword: string,
): Promise<Uint8Array> {
  const email = normalizeEmail(rawEmail);
  const recoveryKey = parseRecoveryKey(rawRecoveryKey);
  let accountKey: Uint8Array | undefined;

  try {
    const client: RegistrationClient = new OpaqueClient(config, opaqueKsf);
    const req = await client.registerInit(newPassword);
    if (req instanceof Error) throw new RecoveryFailedError();

    const recoveryAuthKey = await deriveRecoveryAuthKey(recoveryKey);
    let attemptId: string;
    let registrationResponse: string;
    let recoveryKeys: RecoveryWrapSchema;
    try {
      ({ attemptId, registrationResponse, recoveryKeys } = await trpc.recovery.startRecovery.mutate(
        {
          email,
          recoveryAuthKey: toBase64(recoveryAuthKey),
          registrationRequest: bytesToB64(req.serialize()),
        },
      ));
    } catch (err) {
      if (isThrottled(err)) throw new LoginThrottledError();
      throw new RecoveryFailedError();
    } finally {
      wipe(recoveryAuthKey);
    }

    try {
      accountKey = await unwrapAccountKeyWithRecoveryKey(recoveryKey, recoveryKeys);
    } catch {
      // Verifier matched but the wrap doesn't — corrupt or tampered key set.
      throw new RecoveryFailedError();
    }

    let resp: RegistrationResponse;
    try {
      resp = RegistrationResponse.deserialize(config, b64ToBytes(registrationResponse));
    } catch {
      throw new RecoveryFailedError();
    }
    const finished = await client.registerFinish(resp, SERVER_IDENTITY, email);
    if (finished instanceof Error) throw new RecoveryFailedError();

    const { recoveryKey: newRecoveryKey, ...userKeys } = await generateUserKeys(
      newPassword,
      accountKey,
    );

    try {
      await trpc.recovery.finishRecovery.mutate({
        email,
        attemptId,
        registrationRecord: bytesToB64(finished.record.serialize()),
        userKeys,
      });
    } catch (err) {
      wipe(newRecoveryKey);
      if (isThrottled(err)) throw new LoginThrottledError();
      throw new RecoveryFailedError();
    }

    return newRecoveryKey;
  } finally {
    wipe(recoveryKey);
    if (accountKey) wipe(accountKey);
  }
}

/** What a local recovery stores in place of the old key wraps, and the key to show once. */
export type LocalRecovery = {
  material: AccountKeyMaterial;
  recovery: RecoveryKeySchema;
  /** Plaintext: the caller shows it once, then wipes it. Never sent anywhere. */
  recoveryKey: Uint8Array;
};

/**
 * Reset the master password of a `local` profile with the recovery key (ADR
 * 0001 D10), on the device only: unwrap the account key with the recovery
 * wrap kept at creation and wrap that same key under the new password (Argon2
 * in the worker) and a fresh recovery key. Vault keys and the keypair stay, so
 * every record stays readable; the old recovery key stops working once the
 * result is stored.
 *
 * The recovered key must open the personal vault: the result replaces the
 * only password wrap on the device, and one around another key would lock
 * the vault for good.
 *
 * Throws `RecoveryKeyInvalidError` (malformed key), `RecoveryFailedError`
 * (the key doesn't open the wrap) or `LocalRecoveryMismatchError`.
 */
export async function recoverLocalVault(
  material: AccountKeyMaterial,
  recovery: RecoveryKeySchema,
  vaults: readonly MemberVault[],
  rawRecoveryKey: string,
  newPassword: string,
): Promise<LocalRecovery> {
  const recoveryKey = parseRecoveryKey(rawRecoveryKey);
  let accountKey: Uint8Array;
  try {
    accountKey = await unwrapAccountKeyWithRecoveryKey(recoveryKey, recovery);
  } catch {
    throw new RecoveryFailedError();
  } finally {
    wipe(recoveryKey);
  }

  try {
    const personal = vaults.find((v) => v.kind === "personal");
    try {
      if (!personal) throw new Error("no personal vault");
      wipe(unwrapVaultKey(accountKey, personal));
    } catch {
      throw new LocalRecoveryMismatchError();
    }

    const passwordWrap = await wrapGivenAccountKeyForPassword(newPassword, accountKey);
    const { recoveryKey: newRecoveryKey, ...newRecovery } = await generateRecoveryKeys(accountKey);
    return {
      material: { ...passwordWrap, userKeyPair: material.userKeyPair },
      recovery: newRecovery,
      recoveryKey: newRecoveryKey,
    };
  } finally {
    wipe(accountKey);
  }
}
