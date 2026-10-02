import {
  decryptXChaCha,
  encryptXChaCha,
  hkdf,
  signHmac,
  unwrapAccountKey,
  unwrapUserPrivateKey,
  unwrapVaultKey,
  wipe,
  wrapAccountKey,
} from "@repo/crypto";
import type { MemberVaultKey, UserKeyPair } from "@repo/schema";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import type { LoginBundle } from "./session-persistence.types";

class SessionLockedError extends Error {
  override message: string = "SessionLockedError";
}

class SecretsStore {
  // Session related keys
  sessionId?: string;
  private sessionSecret?: Uint8Array;
  private authKey?: Uint8Array;
  private authSalt?: Uint8Array;

  // Vault related keys (ADR 0001 D3): the account key unwraps the vault keys.
  private accountKey?: Uint8Array;
  private vaultKeys = new Map<string, Uint8Array>();
  private personalVaultId?: string;
  // The X25519 keypair (ADR 0001 D7), checked against each other on load.
  private userPrivateKey?: Uint8Array;
  private verifiedPublicKey?: string;

  // Temporary password for biometric enrollment
  private password?: string;

  /**
   * Phase 1: Establish session (fast — HKDF only).
   * After this, authenticated requests work but item decryption does not.
   */
  async unlockSession(sessionId: string, sessionKey: string, authSalt: Uint8Array) {
    this.sessionId = sessionId;
    this.sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
    this.authSalt = authSalt;
    this.authKey = await this.deriveAuthKey();
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
   * before. Throws (leaving none loaded) when a wrap fails to open or there is
   * no personal vault: the vault can't be used then.
   */
  loadVaultKeys(wraps: readonly MemberVaultKey[]) {
    const accountKey = this.accountKey;
    if (!accountKey) throw new SessionLockedError();
    this.wipeVaultKeys();

    const keys = new Map<string, Uint8Array>();
    try {
      for (const wrap of wraps) {
        if (keys.has(wrap.vaultId)) throw new Error(`Duplicate vault ${wrap.vaultId}`);
        keys.set(wrap.vaultId, unwrapVaultKey(accountKey, wrap));
      }
    } catch (e) {
      for (const key of keys.values()) wipe(key);
      throw e;
    }

    const personal = wraps.find((wrap) => wrap.kind === "personal");
    if (!personal) {
      for (const key of keys.values()) wipe(key);
      throw new Error("No personal vault");
    }

    this.vaultKeys = keys;
    this.personalVaultId = personal.vaultId;
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
   * Export the in-memory session + account key for persistence to OS secure
   * storage. Returns base64 material (minus the account email, which the caller
   * supplies). Vault keys aren't included: they're re-unwrapped from the local
   * database after a restore. Throws unless both the session and vault are unlocked.
   */
  exportPersistableBundle(): Omit<LoginBundle, "email"> {
    if (!this.sessionId || !this.authKey || !this.authSalt || !this.accountKey) {
      throw new SessionLockedError();
    }

    return {
      sessionId: this.sessionId,
      authKeyB64: toBase64(this.authKey),
      authSaltB64: toBase64(this.authSalt),
      accountKeyB64: toBase64(this.accountKey),
    };
  }

  /**
   * Restore a previously-persisted session straight from key material — no
   * OPAQUE handshake, no Argon2. After this, authenticated requests
   * (`signRequest`) work; follow with `loadVaultKeys` for item decryption.
   * `sessionSecret` is intentionally not restored: it is only an intermediate
   * used to derive `authKey`, which we already have.
   */
  restoreSession(bundle: Omit<LoginBundle, "email">) {
    // Decode everything first: a malformed bundle throws without touching state.
    const authKey = fromBase64(bundle.authKeyB64);
    const authSalt = fromBase64(bundle.authSaltB64);
    const accountKey = fromBase64(bundle.accountKeyB64);

    if (this.authKey) wipe(this.authKey);
    if (this.authSalt) wipe(this.authSalt);
    this.sessionId = bundle.sessionId;
    this.authKey = authKey;
    this.authSalt = authSalt;
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

  lock() {
    this.sessionId = undefined;

    if (this.sessionSecret) wipe(this.sessionSecret);
    this.sessionSecret = undefined;

    if (this.authKey) wipe(this.authKey);
    this.authKey = undefined;

    if (this.authSalt) wipe(this.authSalt);
    this.authSalt = undefined;

    this.lockVault();

    this.password = undefined;
  }

  /** Wipe the account, vault and private keys; the server session (if any) stays. */
  lockVault() {
    if (this.accountKey) wipe(this.accountKey);
    this.accountKey = undefined;
    this.wipeVaultKeys();
    this.wipeUserKeyPair();
  }

  async signRequest(message: string) {
    if (!this.authKey) throw new SessionLockedError();
    return await signHmac(this.authKey, message);
  }

  /**
   * The key records are encrypted with. Until records carry a `vaultId` (vault
   * data model, ADR 0001 D6) every record lives in the personal vault.
   */
  private recordKey(): Uint8Array {
    const key = this.personalVaultId && this.vaultKeys.get(this.personalVaultId);
    if (!key) throw new SessionLockedError();
    return key;
  }

  encryptRecord(data: string): [encryptedData: string, nonce: string] {
    return encryptXChaCha(this.recordKey(), data);
  }

  decryptRecord(encryptedData: string, nonce: string): Uint8Array {
    return decryptXChaCha(this.recordKey(), encryptedData, nonce);
  }

  exportVaultKeyForWorker(): Uint8Array {
    return this.recordKey().slice();
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
    this.personalVaultId = undefined;
  }

  private wipeUserKeyPair() {
    if (this.userPrivateKey) wipe(this.userPrivateKey);
    this.userPrivateKey = undefined;
    this.verifiedPublicKey = undefined;
  }

  private async deriveAuthKey(): Promise<Uint8Array> {
    if (!this.sessionSecret) throw new SessionLockedError();
    if (!this.authSalt) throw new SessionLockedError();

    return await hkdf(this.sessionSecret, "sessionAuth", this.authSalt);
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

export const secretsStore = new SecretsStore();
