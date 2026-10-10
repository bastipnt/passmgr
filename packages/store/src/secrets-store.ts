import {
  createVault,
  decryptRecordData,
  decryptVaultMeta,
  encryptRecordData,
  encryptVaultMeta,
  hkdf,
  type RecordCipherContext,
  rotateVaultKey,
  signHmac,
  unwrapAccountKey,
  unwrapPreviousVaultKey,
  unwrapUserPrivateKey,
  unwrapVaultKey,
  vaultKeyId,
  wipe,
  wrapAccountKey,
} from "@repo/crypto";
import {
  CURRENT_CRYPTO_VERSION,
  type EncryptedVaultMeta,
  type MemberVault,
  type UserKeyPair,
  type VaultMeta,
  vaultMetaSchema,
} from "@repo/schema";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import type { LoginBundle, ServerSessionBundle } from "./session-persistence.types";

class SessionLockedError extends Error {
  override message: string = "SessionLockedError";
}

function decodeServerSession(server: ServerSessionBundle) {
  return {
    sessionId: server.sessionId,
    authKey: fromBase64(server.authKeyB64),
    authSalt: fromBase64(server.authSaltB64),
  };
}

class SecretsStore {
  // Session related keys
  sessionId?: string;
  private sessionSecret?: Uint8Array;
  private authKey?: Uint8Array;
  private authSalt?: Uint8Array;

  // Vault related keys (ADR 0001 D3): the account key unwraps the vault keys,
  // each vault's current key its earlier ones (`vaultKeyId` → key).
  private accountKey?: Uint8Array;
  private vaultKeys = new Map<string, Uint8Array>();
  // vaultId → the key version new records are encrypted with.
  private currentKeyVersions = new Map<string, number>();
  private personalVaultId?: string;
  // The X25519 keypair (ADR 0001 D7), checked against each other on load.
  private userPrivateKey?: Uint8Array;
  private verifiedPublicKey?: string;

  // Temporary password for biometric enrollment
  private password?: string;

  // Bumped on every lock: work started before a lock (a background server
  // connect) compares it to tell that its unlock is gone.
  private epoch = 0;

  /**
   * Attach server auth (ADR 0001 D2): derive the request-signing key from a
   * fresh OPAQUE session (fast, HKDF only). Independent of the vault: it can
   * come before the unlock (login) or after it (reconnect).
   */
  async unlockSession(sessionId: string, sessionKey: string, authSalt: Uint8Array) {
    const sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
    const authKey = await hkdf(sessionSecret, "sessionAuth", authSalt);
    this.detachServer();
    this.sessionId = sessionId;
    this.sessionSecret = sessionSecret;
    this.authSalt = authSalt;
    this.authKey = authKey;
  }

  /** Whether requests can be signed: a server session is attached. */
  get hasServerSession(): boolean {
    return this.sessionId !== undefined && this.authKey !== undefined;
  }

  /**
   * Drop the server session keys (the session ended or expired). The vault
   * stays unlocked: the session goes from `online` to `offline`.
   */
  detachServer() {
    this.sessionId = undefined;

    if (this.sessionSecret) wipe(this.sessionSecret);
    this.sessionSecret = undefined;

    if (this.authKey) wipe(this.authKey);
    this.authKey = undefined;

    if (this.authSalt) wipe(this.authSalt);
    this.authSalt = undefined;
  }

  /**
   * Phase 2: Unwrap the account key with the password KEK (slow part: the
   * Argon2id derivation of the KEK happens before). Wipes the KEK. Throws on a
   * wrong password. Follow with `loadVaultKeys`.
   */
  unlockAccount(
    passwordKek: Uint8Array,
    encryptedAccountKeyB64: string,
    accountKeyEncryptionNonceB64: string,
  ) {
    try {
      this.setAccountKey(
        unwrapAccountKey(passwordKek, encryptedAccountKeyB64, accountKeyEncryptionNonceB64),
      );
    } finally {
      wipe(passwordKek);
    }
  }

  /**
   * Biometric / restored unlock: set the account key directly (already
   * decrypted via WebAuthn PRF or OS secure storage). No server session.
   */
  unlockWithAccountKey(accountKey: Uint8Array) {
    this.setAccountKey(accountKey);
  }

  /**
   * Unwrap the user's vault keys with the account key, replacing any loaded
   * before. Only the personal vault is required: when its wrap is missing or
   * doesn't open, or the list names a vault twice, this throws and the keys
   * loaded before stay in place. Any other vault whose wrap doesn't open is
   * left out (its records stay hidden) and returned, so one bad membership
   * row can't lock the user out of everything else.
   *
   * Each vault's earlier keys (`previousKeys`) are opened from the current one
   * down, as far as the chain opens: a broken link only hides the history
   * below it.
   *
   * @returns the ids of the vaults that were skipped
   */
  loadVaultKeys(wraps: readonly MemberVault[]): string[] {
    const accountKey = this.accountKey;
    if (!accountKey) throw new SessionLockedError();

    const personal = wraps.filter((wrap) => wrap.kind === "personal");
    if (personal.length !== 1) throw new Error("Expected exactly one personal vault");

    const keys = new Map<string, Uint8Array>();
    const current = new Map<string, number>();
    const skipped: string[] = [];
    try {
      for (const wrap of wraps) {
        if (current.has(wrap.vaultId) || skipped.includes(wrap.vaultId)) {
          throw new Error(`Duplicate vault ${wrap.vaultId}`);
        }
        let key: Uint8Array;
        try {
          key = unwrapVaultKey(accountKey, wrap);
        } catch (e) {
          if (wrap.kind === "personal") throw e;
          skipped.push(wrap.vaultId);
          continue;
        }
        keys.set(vaultKeyId(wrap.vaultId, wrap.keyVersion), key);
        current.set(wrap.vaultId, wrap.keyVersion);
        loadPreviousKeys(wrap, key, keys);
      }
    } catch (e) {
      for (const key of keys.values()) wipe(key);
      throw e;
    }

    this.wipeVaultKeys();
    this.vaultKeys = keys;
    this.currentKeyVersions = current;
    this.personalVaultId = personal[0]!.vaultId;
    return skipped;
  }

  /**
   * Unwrap the user's X25519 private key with the account key and keep it with
   * its public key. Throws (leaving none loaded) when the wrap doesn't open or
   * doesn't belong to the public key: the server handed out a keypair that
   * isn't the user's, and a fingerprint shown for it would vouch for a key the
   * user doesn't hold.
   */
  loadUserKeyPair(keyPair: UserKeyPair) {
    const accountKey = this.accountKey;
    if (!accountKey) throw new SessionLockedError();
    this.wipeUserKeyPair();

    this.userPrivateKey = unwrapUserPrivateKey(accountKey, keyPair);
    this.verifiedPublicKey = keyPair.publicKey;
  }

  /** The user's own public key, as proven by the private key (for the fingerprint). */
  get userPublicKey(): string | undefined {
    return this.verifiedPublicKey;
  }

  /**
   * Export the account key (and the server session, when one is attached) for
   * persistence to OS secure storage. Vault keys aren't included: they're
   * re-unwrapped from the local database after a restore. Throws while the
   * vault is locked.
   */
  exportPersistableBundle(): LoginBundle {
    if (!this.accountKey) throw new SessionLockedError();

    const bundle: LoginBundle = { accountKeyB64: toBase64(this.accountKey) };
    if (this.sessionId && this.authKey && this.authSalt) {
      bundle.server = {
        sessionId: this.sessionId,
        authKeyB64: toBase64(this.authKey),
        authSaltB64: toBase64(this.authSalt),
      };
    }
    return bundle;
  }

  /**
   * Restore a persisted bundle straight from key material — no OPAQUE
   * handshake, no Argon2. Sets the account key, and the server session when
   * the bundle has one (any previous one is dropped either way). Follow with
   * `loadVaultKeys` for item decryption. `sessionSecret` is intentionally not
   * restored: it is only an intermediate used to derive `authKey`.
   */
  restoreSession(bundle: LoginBundle) {
    // Decode everything first: a malformed bundle throws without touching state.
    const accountKey = fromBase64(bundle.accountKeyB64);
    const server = bundle.server && decodeServerSession(bundle.server);

    this.detachServer();
    if (server) {
      this.sessionId = server.sessionId;
      this.authKey = server.authKey;
      this.authSalt = server.authSalt;
    }
    this.setAccountKey(accountKey);
  }

  setPassword(pw: string) {
    this.password = pw;
  }

  getPassword(): string | undefined {
    return this.password;
  }

  clearPassword() {
    this.password = undefined;
  }

  get isVaultUnlocked(): boolean {
    return this.accountKey !== undefined && this.personalVaultId !== undefined;
  }

  /** Wipe everything: server session, account, vault and private keys, password. */
  lock() {
    this.detachServer();
    this.lockVault();
    this.password = undefined;
  }

  /** Changes whenever the vault is locked; see `epoch`. */
  get lockEpoch(): number {
    return this.epoch;
  }

  /** Wipe the account, vault and private keys; the server session (if any) stays. */
  lockVault() {
    this.epoch += 1;
    if (this.accountKey) wipe(this.accountKey);
    this.accountKey = undefined;
    this.wipeVaultKeys();
    this.wipeUserKeyPair();
  }

  async signRequest(message: string) {
    if (!this.authKey) throw new SessionLockedError();
    return await signHmac(this.authKey, message);
  }

  /** The personal vault: where records go unless the user picks another vault. */
  get defaultVaultId(): string | undefined {
    return this.personalVaultId;
  }

  /** The key version new records of the vault are encrypted with. */
  currentKeyVersion(vaultId: string): number {
    const keyVersion = this.currentKeyVersions.get(vaultId);
    if (keyVersion === undefined) throw new SessionLockedError();
    return keyVersion;
  }

  /** A vault's key: the current one, or the one of `keyVersion`. */
  private vaultKey(vaultId: string, keyVersion = this.currentKeyVersion(vaultId)): Uint8Array {
    const key = this.vaultKeys.get(vaultKeyId(vaultId, keyVersion));
    if (!key) throw new SessionLockedError();
    return key;
  }

  /**
   * Encrypt a record payload under its vault's current key, bound to the
   * record and vault. Resolves the key version it used too.
   */
  encryptRecord(
    context: Omit<RecordCipherContext, "cryptoVersion">,
    data: string,
  ): [encryptedData: string, nonce: string, keyVersion: number] {
    const keyVersion = this.currentKeyVersion(context.vaultId);
    const [encryptedData, nonce] = encryptRecordData(
      this.vaultKey(context.vaultId, keyVersion),
      { ...context, cryptoVersion: CURRENT_CRYPTO_VERSION },
      data,
    );
    return [encryptedData, nonce, keyVersion];
  }

  /** Decrypt a record version with the vault key it was encrypted with. */
  decryptRecord(
    row: RecordCipherContext & {
      keyVersion: number;
      encryptedData: string;
      encryptionNonce: string;
    },
  ): Uint8Array {
    return decryptRecordData(
      this.vaultKey(row.vaultId, row.keyVersion),
      row,
      row.encryptedData,
      row.encryptionNonce,
    );
  }

  /** Copies of every vault key (`vaultKeyId` → key), for the decrypt worker. */
  exportVaultKeysForWorker(): Map<string, Uint8Array> {
    if (this.vaultKeys.size === 0) throw new SessionLockedError();
    return new Map([...this.vaultKeys].map(([vaultId, key]) => [vaultId, key.slice()]));
  }

  /** Throws when the metadata doesn't open with the vault's key or isn't valid. */
  decryptVaultMeta(vault: Pick<MemberVault, "vaultId"> & EncryptedVaultMeta): VaultMeta {
    return vaultMetaSchema.parse(
      decryptVaultMeta(this.vaultKey(vault.vaultId), vault.vaultId, vault),
    );
  }

  encryptVaultMeta(vaultId: string, meta: VaultMeta): EncryptedVaultMeta {
    return encryptVaultMeta(this.vaultKey(vaultId), vaultId, meta);
  }

  /**
   * A rotation of the vault's key (`vault.rotateKey`): the next key version,
   * the current key wrapped under it and the metadata re-encrypted. The new
   * key is loaded with the vault list it ends up in (`loadVaultKeys`).
   */
  rotateVaultKey(vault: Pick<MemberVault, "vaultId"> & EncryptedVaultMeta) {
    if (!this.accountKey) throw new SessionLockedError();
    const keyVersion = this.currentKeyVersion(vault.vaultId);
    return rotateVaultKey(
      this.accountKey,
      this.vaultKey(vault.vaultId, keyVersion),
      vault.vaultId,
      keyVersion,
      this.decryptVaultMeta(vault),
    );
  }

  /**
   * A new vault for `vault.create`: fresh id and key, wrapped under the account
   * key. Its key is loaded with the vault list after the next sync.
   */
  createVault(meta: VaultMeta): ReturnType<typeof createVault> {
    if (!this.accountKey) throw new SessionLockedError();
    return createVault(this.accountKey, meta);
  }

  /** A copy of the account key, for biometric enrollment. The caller wipes it. */
  exportAccountKey(): Uint8Array {
    if (!this.accountKey) throw new SessionLockedError();
    return this.accountKey.slice();
  }

  /**
   * Re-encrypt the in-memory account key under a new password KEK (e.g. after
   * Argon2 params change). The plaintext key never leaves memory; only the
   * returned ciphertext is persisted. Vault keys are unaffected. Caller is
   * responsible for wiping `passwordKek` afterwards.
   */
  rewrapAccountKey(passwordKek: Uint8Array): [encryptedAccountKey: string, nonce: string] {
    if (!this.accountKey) throw new SessionLockedError();
    return wrapAccountKey(passwordKek, this.accountKey);
  }

  /** Replace the account key, wiping the previous buffer (unless it is the same one). */
  private setAccountKey(accountKey: Uint8Array) {
    if (this.accountKey && this.accountKey !== accountKey) wipe(this.accountKey);
    this.accountKey = accountKey;
  }

  private wipeVaultKeys() {
    for (const key of this.vaultKeys.values()) wipe(key);
    this.vaultKeys = new Map();
    this.currentKeyVersions = new Map();
    this.personalVaultId = undefined;
  }

  private wipeUserKeyPair() {
    if (this.userPrivateKey) wipe(this.userPrivateKey);
    this.userPrivateKey = undefined;
    this.verifiedPublicKey = undefined;
  }

  // Test-only: hand out live references to internal buffers so tests can
  // assert `lock()` zeros them in place. Not part of the public API.
  _peekBuffers(): {
    sessionSecret?: Uint8Array;
    authKey?: Uint8Array;
    authSalt?: Uint8Array;
    accountKey?: Uint8Array;
    vaultKeys: Uint8Array[];
    userPrivateKey?: Uint8Array;
  } {
    return {
      sessionSecret: this.sessionSecret,
      authKey: this.authKey,
      authSalt: this.authSalt,
      accountKey: this.accountKey,
      vaultKeys: [...this.vaultKeys.values()],
      userPrivateKey: this.userPrivateKey,
    };
  }
}

/**
 * Open a vault's earlier keys into `keys`, each with the key one version
 * above it, from the newest down. Stops at the first link that is missing or
 * doesn't open: the keys below it stay unknown.
 */
function loadPreviousKeys(
  vault: MemberVault,
  currentKey: Uint8Array,
  keys: Map<string, Uint8Array>,
) {
  const links = new Map(vault.previousKeys.map((link) => [link.keyVersion, link]));
  let newer = currentKey;
  for (let keyVersion = vault.keyVersion - 1; keyVersion >= 1; keyVersion--) {
    const link = links.get(keyVersion);
    if (!link) return;
    try {
      newer = unwrapPreviousVaultKey(newer, vault.vaultId, link);
    } catch {
      return;
    }
    keys.set(vaultKeyId(vault.vaultId, keyVersion), newer);
  }
}

export const secretsStore = new SecretsStore();
