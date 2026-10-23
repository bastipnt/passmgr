import { OpaqueClient, type RegistrationClient, RegistrationResponse } from "@cloudflare/opaque-ts";
import {
  deriveRecoveryAuthKey,
  generateRecoveryKeys,
  generateUserKeys,
  normalizeEmail,
  OPAQUE_SERVER_IDENTITY,
  openPendingRecovery,
  sealPendingRecovery,
  unwrapAccountKeyWithRecoveryKey,
  unwrapVaultKey,
  wipe,
} from "@repo/crypto";
import { opaqueKsf } from "@repo/crypto/services/opaque-ksf";
import {
  type AccountKeyMaterial,
  type MemberVault,
  type PendingRecovery,
  pendingRecoverySchema,
  type RecoveryKeySchema,
  type RecoveryWrapSchema,
  type SealedPendingRecovery,
} from "@repo/schema";
import type { AppRouter } from "@repo/types";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import type { TRPCClient } from "@trpc/client";
import { devicePasswordKekParams } from "./account/password-kek-params";
import { wrapGivenAccountKeyForPassword } from "./account/rekey-password-keys";
import { LoginThrottledError, LoginUnreachableError } from "./login";
import {
  b64ToBytes,
  bytesToB64,
  opaqueConfig as config,
  opaqueInput,
  opaqueInputFor,
} from "./opaque";
import { deriveArgon2InWorker } from "./util/derive-password-kek";
import { isServerAnswer, isServerError, isThrottled } from "./util/trpc-errors";

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
    const req = await client.registerInit(await opaqueInputFor(newPassword, email));
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
    const finished = await client.registerFinish(resp, OPAQUE_SERVER_IDENTITY, email);
    if (finished instanceof Error) throw new RecoveryFailedError();

    const { recoveryKey: newRecoveryKey, ...userKeys } = await generateUserKeys(
      newPassword,
      accountKey,
      await devicePasswordKekParams(),
      deriveArgon2InWorker,
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

/**
 * Check a recovery key against a recovery wrap on the device, before a
 * new password is asked for. Throws `RecoveryKeyInvalidError` (malformed key)
 * or `RecoveryFailedError` (the key doesn't open the wrap).
 */
export async function checkLocalRecoveryKey(
  recovery: RecoveryWrapSchema,
  rawRecoveryKey: string,
): Promise<void> {
  const recoveryKey = parseRecoveryKey(rawRecoveryKey);
  try {
    wipe(await unwrapAccountKeyWithRecoveryKey(recoveryKey, recovery));
  } catch {
    throw new RecoveryFailedError();
  } finally {
    wipe(recoveryKey);
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
 * Throws `RecoveryKeyInvalidError` (malformed key), `RecoveryFailedError`
 * (the key doesn't open the wrap) or `LocalRecoveryMismatchError`.
 */
export async function recoverLocalVault(
  material: AccountKeyMaterial,
  recovery: RecoveryWrapSchema,
  vaults: readonly MemberVault[],
  rawRecoveryKey: string,
  newPassword: string,
): Promise<LocalRecovery> {
  return await rewrapOnDevice(recovery, vaults, rawRecoveryKey, async (accountKey) => {
    const passwordWrap = await wrapGivenAccountKeyForPassword(newPassword, accountKey);
    const { recoveryKey, ...newRecovery } = await generateRecoveryKeys(accountKey);
    return {
      material: { ...passwordWrap, userKeyPair: material.userKeyPair },
      recovery: newRecovery,
      recoveryKey,
    };
  });
}

/** What a linked profile's offline reset stores, and the key to show once. */
export type LinkedRecovery = {
  material: AccountKeyMaterial;
  recoveryWrap: RecoveryWrapSchema;
  pending: SealedPendingRecovery;
  /** `pending` opened, for finishing it right away when online. */
  serverRecovery: PendingRecovery;
  /** Plaintext: the caller shows it once, then wipes it. Never sent anywhere. */
  recoveryKey: Uint8Array;
};

/**
 * Reset the master password of a `linked` profile on the device (ADR 0001 D10
 * amended), with the recovery wrap cached from its last login: the same new
 * wraps as `recoverLocalVault`, and the server's recovery to finish once
 * online (`finishPendingRecovery`), sealed under the account key. Its proof is
 * the recovery key the server still knows: an earlier pending reset's, when
 * there is one (the key entered now may be the one that reset issued).
 *
 * Throws like `recoverLocalVault`.
 */
export async function recoverLinkedVault(
  material: AccountKeyMaterial,
  recoveryWrap: RecoveryWrapSchema,
  vaults: readonly MemberVault[],
  earlier: SealedPendingRecovery | null,
  rawRecoveryKey: string,
  newPassword: string,
): Promise<LinkedRecovery> {
  return await rewrapOnDevice(
    recoveryWrap,
    vaults,
    rawRecoveryKey,
    async (accountKey, recoveryKey) => {
      const recoveryAuthKey = earlier
        ? parsePendingRecovery(openPendingRecovery(accountKey, earlier)).recoveryAuthKey
        : await recoveryAuthKeyOf(recoveryKey);
      const passwordWrap = await wrapGivenAccountKeyForPassword(newPassword, accountKey);
      const { recoveryKey: newRecoveryKey, ...newRecovery } =
        await generateRecoveryKeys(accountKey);
      const pending: PendingRecovery = {
        recoveryAuthKey,
        userKeys: { ...passwordWrap, ...newRecovery },
      };
      const { recoveryVerifier: _, ...newWrap } = newRecovery;
      const plaintext = fromString(JSON.stringify(pending));
      try {
        return {
          material: { ...passwordWrap, userKeyPair: material.userKeyPair },
          recoveryWrap: newWrap,
          pending: sealPendingRecovery(accountKey, plaintext),
          serverRecovery: pending,
          recoveryKey: newRecoveryKey,
        };
      } finally {
        wipe(plaintext);
      }
    },
  );
}

async function recoveryAuthKeyOf(recoveryKey: Uint8Array): Promise<string> {
  const recoveryAuthKey = await deriveRecoveryAuthKey(recoveryKey);
  try {
    return toBase64(recoveryAuthKey);
  } finally {
    wipe(recoveryAuthKey);
  }
}

/**
 * Unwrap the account key with the recovery key and hand it to `rewrap`.
 *
 * The recovered key must open the personal vault: the result replaces the
 * only password wrap on the device, and one around another key would lock
 * the vault for good.
 */
async function rewrapOnDevice<T>(
  wrap: RecoveryWrapSchema,
  vaults: readonly MemberVault[],
  rawRecoveryKey: string,
  rewrap: (accountKey: Uint8Array, recoveryKey: Uint8Array) => Promise<T>,
): Promise<T> {
  const recoveryKey = parseRecoveryKey(rawRecoveryKey);
  let accountKey: Uint8Array | undefined;
  try {
    try {
      accountKey = await unwrapAccountKeyWithRecoveryKey(recoveryKey, wrap);
    } catch {
      throw new RecoveryFailedError();
    }
    const personal = vaults.find((v) => v.kind === "personal");
    try {
      if (!personal) throw new Error("no personal vault");
      wipe(unwrapVaultKey(accountKey, personal));
    } catch {
      throw new LocalRecoveryMismatchError();
    }
    return await rewrap(accountKey, recoveryKey);
  } finally {
    wipe(recoveryKey);
    if (accountKey) wipe(accountKey);
  }
}

/** A pending recovery opened from its seal (`openPendingRecovery`); wipes `plaintext`. */
export function parsePendingRecovery(plaintext: Uint8Array): PendingRecovery {
  try {
    return pendingRecoverySchema.parse(JSON.parse(new TextDecoder().decode(plaintext)));
  } finally {
    wipe(plaintext);
  }
}

/**
 * Finish a linked profile's offline reset on the server (`recovery.startRecovery`
 * + `finishRecovery`): the old recovery key's proof, a new OPAQUE registration
 * for the new password (`opaquePassword`, its `deriveOpaquePassword`) and the
 * key set made on the device. The server swaps the OPAQUE record and key set
 * and revokes every session, as for `recoverAccount`.
 *
 * Throws `RecoveryFailedError` (the server refused: the account's recovery key
 * changed meanwhile, or the reset already went through), `LoginThrottledError`
 * or `LoginUnreachableError` (retry later).
 */
export async function finishPendingRecovery(
  trpc: RecoveryTRPCClient,
  rawEmail: string,
  opaquePassword: Uint8Array,
  pending: PendingRecovery,
): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const client: RegistrationClient = new OpaqueClient(config, opaqueKsf);
  const req = await client.registerInit(opaqueInput(opaquePassword));
  if (req instanceof Error) throw new RecoveryFailedError();

  let attemptId: string;
  let registrationResponse: string;
  try {
    ({ attemptId, registrationResponse } = await trpc.recovery.startRecovery.mutate({
      email,
      recoveryAuthKey: pending.recoveryAuthKey,
      registrationRequest: bytesToB64(req.serialize()),
    }));
  } catch (err) {
    throw recoveryRequestFailure(err);
  }

  let resp: RegistrationResponse;
  try {
    resp = RegistrationResponse.deserialize(config, b64ToBytes(registrationResponse));
  } catch {
    throw new RecoveryFailedError();
  }
  const finished = await client.registerFinish(resp, OPAQUE_SERVER_IDENTITY, email);
  if (finished instanceof Error) throw new RecoveryFailedError();

  try {
    await trpc.recovery.finishRecovery.mutate({
      email,
      attemptId,
      registrationRecord: bytesToB64(finished.record.serialize()),
      userKeys: pending.userKeys,
    });
  } catch (err) {
    throw recoveryRequestFailure(err);
  }
}

function recoveryRequestFailure(err: unknown): Error {
  if (isThrottled(err)) return new LoginThrottledError();
  if (!isServerAnswer(err) || isServerError(err)) return new LoginUnreachableError();
  return new RecoveryFailedError();
}
