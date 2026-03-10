import {
  decryptXChaCha,
  encryptXChaCha,
  fromBase64,
  fromString,
  hkdf,
  signHmac,
  wipe,
} from "@repo/crypto";
import type { ArgonParams, PasswordKeySchema } from "@repo/schema";

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
  private passwordKekParams?: ArgonParams;
  private passwordKekSalt?: Uint8Array;
  private encryptedVaultKeyB64?: string;
  private vaultKeyEncryptionNonceB64?: string;
  private vaultKey?: Uint8Array;

  /**
   * Phase 1: Establish session (fast — HKDF only).
   * After this, authenticated requests work but item decryption does not.
   */
  async unlockSession(
    sessionId: string,
    sessionKey: string,
    authSalt: Uint8Array,
    // userPasswordKeys: PasswordKeySchema,
  ) {
    this.sessionId = sessionId;
    this.sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
    this.authSalt = authSalt;
    this.authKey = await this.deriveAuthKey();

    // this.passwordKekParams = userPasswordKeys.passwordKekParams;
    // this.passwordKekSalt = fromBase64(userPasswordKeys.passwordKekSalt);
    // this.encryptedVaultKeyB64 = userPasswordKeys.encryptedVaultKey;
    // this.vaultKeyEncryptionNonceB64 = userPasswordKeys.vaultKeyEncryptionNonce;
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
    this.encryptedVaultKeyB64 = encryptedVaultKeyB64;
    this.vaultKeyEncryptionNonceB64 = vaultKeyEncryptionNonceB64;

    this.vaultKey = decryptXChaCha(
      passwordKek,
      this.encryptedVaultKeyB64,
      this.vaultKeyEncryptionNonceB64,
    );
    wipe(passwordKek);
  }

  /**
   * Biometric unlock: set vault key directly (already decrypted via WebAuthn PRF).
   * No server session is established — only item decryption works.
   */
  unlockWithVaultKey(vaultKey: Uint8Array) {
    this.vaultKey = vaultKey;
  }

  getVaultUnlockParams(): { passwordKekSalt: Uint8Array; passwordKekParams: ArgonParams } {
    if (!this.passwordKekSalt || !this.passwordKekParams) {
      throw new SessionLockedError();
    }
    return {
      passwordKekSalt: this.passwordKekSalt,
      passwordKekParams: this.passwordKekParams,
    };
  }

  getEncryptedVaultKeyMaterial(): {
    encryptedVaultKey: string;
    vaultKeyEncryptionNonce: string;
  } {
    if (!this.encryptedVaultKeyB64 || !this.vaultKeyEncryptionNonceB64) {
      throw new SessionLockedError();
    }
    return {
      encryptedVaultKey: this.encryptedVaultKeyB64,
      vaultKeyEncryptionNonce: this.vaultKeyEncryptionNonceB64,
    };
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

    this.passwordKekParams = undefined;

    if (this.passwordKekSalt) wipe(this.passwordKekSalt);
    this.passwordKekSalt = undefined;

    this.encryptedVaultKeyB64 = undefined;
    this.vaultKeyEncryptionNonceB64 = undefined;

    if (this.vaultKey) wipe(this.vaultKey);
    this.vaultKey = undefined;
  }

  async signRequest(message: string) {
    if (!this.authKey) throw new SessionLockedError();
    return await signHmac(this.authKey, message);
  }

  encryptItem(data: string): [encryptedData: string, nonce: string] {
    if (!this.vaultKey) throw new SessionLockedError();
    return encryptXChaCha(this.vaultKey, data);
  }

  decryptItem(encryptedData: string, nonce: string): Uint8Array {
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
