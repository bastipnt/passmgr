import {
  sameAccountKey,
  unwrapAccountKey,
  unwrapUserPrivateKey,
  unwrapVaultKey,
  wipe,
} from "@repo/crypto";
import {
  type AccountKeyMaterial,
  type MemberVault,
  type PasswordKeySchema,
  passwordKeySchema,
  type UserKeyPair,
  type VaultUnlockInfo,
} from "@repo/schema";
import { derivePasswordKek } from "../util/derive-password-kek";

type ServerKeyring = Pick<VaultUnlockInfo, "userPasswordKeys" | "userKeyPair" | "vaultKeys">;

/** The server's keys aren't the ones of the account key they were checked against. */
export class ServerKeyringMismatchError extends Error {
  constructor(cause?: unknown) {
    super("The server's keys don't belong to this account key", { cause });
    this.name = "ServerKeyringMismatchError";
  }
}

/** Throws unless `vaults` holds exactly one personal vault and its key opens with `accountKey`. */
export function assertOpensPersonalVault(accountKey: Uint8Array, vaults: readonly MemberVault[]) {
  const personal = vaults.filter((v) => v.kind === "personal");
  if (personal.length !== 1) throw new Error("Expected exactly one personal vault");
  wipe(unwrapVaultKey(accountKey, personal[0]!));
}

/**
 * Throws `ServerKeyringMismatchError` unless the server's keyring belongs to
 * `accountKey`: its personal vault key and keypair open with it, and so does
 * the personal vault key the device stored before (`stored`), which proves it
 * is the same account key. Checked before the server's copy replaces the
 * device's: that is the only one an offline unlock has, and a server handing
 * out garbage (or another profile's account) would lock the user out of it.
 */
export function verifyServerKeyring(
  accountKey: Uint8Array,
  { userKeyPair, vaultKeys }: { userKeyPair: UserKeyPair; vaultKeys: readonly MemberVault[] },
  stored: readonly MemberVault[] = [],
) {
  try {
    assertOpensPersonalVault(accountKey, vaultKeys);
    if (stored.length > 0) assertOpensPersonalVault(accountKey, stored);
    wipe(unwrapUserPrivateKey(accountKey, userKeyPair));
  } catch (e) {
    throw new ServerKeyringMismatchError(e);
  }
}

/**
 * The key material to store after a reconnect, once the server's keyring is
 * checked against the unlocked account key (`verifyServerKeyring`). The
 * server's password wrap is taken when it is the stored one or the one this
 * device made itself (`expected`: a password change the server didn't
 * confirm), or when it opens with the typed `password` to that same account
 * key. Without the password (an OPAQUE password kept for the reconnect, a
 * device login) any other wrap can't be checked, and the stored one stays.
 * Throws `ServerKeyringMismatchError` when the server's keys aren't this
 * account's.
 */
export async function reconnectKeyMaterial(
  server: ServerKeyring,
  device: { accountKey: Uint8Array; stored: AccountKeyMaterial; expected?: PasswordKeySchema },
  password?: string,
): Promise<AccountKeyMaterial> {
  verifyServerKeyring(device.accountKey, server);
  const { userPasswordKeys: keys, userKeyPair } = server;
  const known = [device.stored, device.expected].some((k) => k && samePasswordKeys(k, keys));
  if (known) return { ...keys, userKeyPair };
  if (password === undefined) return { ...device.stored, userKeyPair };

  const passwordKek = await derivePasswordKek(password, keys);
  let accountKey: Uint8Array;
  try {
    accountKey = unwrapAccountKey(
      passwordKek,
      keys.encryptedAccountKey,
      keys.accountKeyEncryptionNonce,
    );
  } catch (e) {
    throw new ServerKeyringMismatchError(e);
  } finally {
    wipe(passwordKek);
  }
  try {
    if (!sameAccountKey(accountKey, device.accountKey)) throw new ServerKeyringMismatchError();
  } finally {
    wipe(accountKey);
  }
  return { ...keys, userKeyPair };
}

function samePasswordKeys(a: PasswordKeySchema, b: PasswordKeySchema) {
  return (Object.keys(passwordKeySchema.shape) as (keyof PasswordKeySchema)[]).every(
    (key) => JSON.stringify(a[key]) === JSON.stringify(b[key]),
  );
}
