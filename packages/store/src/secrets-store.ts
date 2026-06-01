import { decryptXChaCha, encryptXChaCha, hkdf, signHmac, wipe } from "@repo/crypto";
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

  // Vault related keys
  private vaultKey?: Uint8Array;

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
   * Phase 2: Derive vault key (slow — Argon2id).
   * Must be called after unlockSession. Can run off main thread.
   */
  unlockVault(
    passwordKek: Uint8Array,
    encryptedVaultKeyB64: string,
    vaultKeyEncryptionNonceB64: string,
  ) {
    this.vaultKey = decryptXChaCha(passwordKek, encryptedVaultKeyB64, vaultKeyEncryptionNonceB64);
    wipe(passwordKek);
  }

  /**
   * Biometric unlock: set vault key directly (already decrypted via WebAuthn PRF).
   * No server session is established — only item decryption works.
   */
  unlockWithVaultKey(vaultKey: Uint8Array) {
    this.vaultKey = vaultKey;
  }

  /**
   * Export the in-memory session + vault keys for persistence to OS secure
   * storage. Returns base64 material (minus the account email, which the caller
   * supplies). Throws unless both the session and vault are unlocked.
   */
  exportPersistableBundle(): Omit<LoginBundle, "email"> {
    if (!this.sessionId || !this.authKey || !this.authSalt || !this.vaultKey) {
      throw new SessionLockedError();
    }

    return {
      sessionId: this.sessionId,
      authKeyB64: toBase64(this.authKey),
      authSaltB64: toBase64(this.authSalt),
      vaultKeyB64: toBase64(this.vaultKey),
    };
  }

  /**
   * Restore a previously-persisted session straight from key material — no
   * OPAQUE handshake, no Argon2. After this, both authenticated requests
   * (`signRequest`) and item decryption work, exactly as after a full login +
   * vault unlock. `sessionSecret` is intentionally not restored: it is only an
   * intermediate used to derive `authKey`, which we already have.
   */
  restoreSession(bundle: Omit<LoginBundle, "email">) {
    this.sessionId = bundle.sessionId;
    this.authKey = fromBase64(bundle.authKeyB64);
    this.authSalt = fromBase64(bundle.authSaltB64);
    this.vaultKey = fromBase64(bundle.vaultKeyB64);
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
    return this.vaultKey !== undefined;
  }

  lock() {
    this.sessionId = undefined;

    if (this.sessionSecret) wipe(this.sessionSecret);
    this.sessionSecret = undefined;

    if (this.authKey) wipe(this.authKey);
    this.authKey = undefined;

    if (this.authSalt) wipe(this.authSalt);
    this.authSalt = undefined;

    if (this.vaultKey) wipe(this.vaultKey);
    this.vaultKey = undefined;

    this.password = undefined;
  }

  async signRequest(message: string) {
    if (!this.authKey) throw new SessionLockedError();
    return await signHmac(this.authKey, message);
  }

  encryptRecord(data: string): [encryptedData: string, nonce: string] {
    if (!this.vaultKey) throw new SessionLockedError();
    return encryptXChaCha(this.vaultKey, data);
  }

  decryptRecord(encryptedData: string, nonce: string): Uint8Array {
    if (!this.vaultKey) throw new SessionLockedError();
    return decryptXChaCha(this.vaultKey, encryptedData, nonce);
  }

  exportVaultKeyForWorker(): Uint8Array {
    if (!this.vaultKey) throw new SessionLockedError();
    return this.vaultKey.slice();
  }

  /**
   * Re-encrypt the in-memory vault key under a new password KEK (e.g. after
   * Argon2 params change). The plaintext vault key never leaves memory; only
   * the returned ciphertext is persisted. Caller is responsible for wiping
   * `passwordKek` afterwards.
   */
  rewrapVaultKey(passwordKek: Uint8Array): [encryptedVaultKey: string, nonce: string] {
    if (!this.vaultKey) throw new SessionLockedError();
    return encryptXChaCha(passwordKek, this.vaultKey);
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
    vaultKey?: Uint8Array;
  } {
    return {
      sessionSecret: this.sessionSecret,
      authKey: this.authKey,
      authSalt: this.authSalt,
      vaultKey: this.vaultKey,
    };
  }
}

export const secretsStore = new SecretsStore();
