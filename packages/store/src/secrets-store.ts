import { decryptXChaCha, encryptXChaCha, hkdf, signHmac, wipe } from "@repo/crypto";
import { fromString } from "@repo/util";

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

  private async deriveAuthKey(): Promise<Uint8Array> {
    if (!this.sessionSecret) throw new SessionLockedError();
    if (!this.authSalt) throw new SessionLockedError();

    return await hkdf(this.sessionSecret, "sessionAuth", this.authSalt);
  }
}

export const secretsStore = new SecretsStore();
