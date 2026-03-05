import {
  decryptXChaCha,
  encryptXChaCha,
  fromBase64,
  fromString,
  hkdf,
  retrievePRK,
  signHmac,
  wipe,
} from "@repo/crypto";
import type { ArgonParams, PasswordKeySchema } from "@repo/schema";

class SessionLockedError extends Error {
  override message: string = "SessionLockedError";
}

class SecretsStore {
  sessionId?: string;
  private sessionSecret?: Uint8Array;
  private authKey?: Uint8Array;
  private authSalt?: Uint8Array;

  private passwordKekParams?: ArgonParams;
  private passwordKekSalt?: Uint8Array;
  private encryptedVaultKey?: Uint8Array;
  private vaultKeyEncryptionNonce?: Uint8Array;
  private vaultKey?: Uint8Array;

  async unlock(
    sessionId: string,
    sessionKey: string,
    authSalt: Uint8Array,
    userPasswordKeys: PasswordKeySchema,
    password: string,
  ) {
    this.sessionId = sessionId;
    this.sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
    this.authSalt = authSalt;
    this.authKey = await this.deriveAuthKey();

    this.passwordKekParams = userPasswordKeys.passwordKekParams;
    this.passwordKekSalt = fromBase64(userPasswordKeys.passwordKekSalt);
    this.encryptedVaultKey = fromBase64(userPasswordKeys.encryptedVaultKey);
    this.vaultKeyEncryptionNonce = fromBase64(userPasswordKeys.vaultKeyEncryptionNonce);

    const passwordKek = await retrievePRK(
      password,
      this.passwordKekSalt,
      this.passwordKekParams,
    );
    this.vaultKey = decryptXChaCha(
      passwordKek,
      userPasswordKeys.encryptedVaultKey,
      userPasswordKeys.vaultKeyEncryptionNonce,
    );
    wipe(passwordKek);
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

    if (this.encryptedVaultKey) wipe(this.encryptedVaultKey);
    this.encryptedVaultKey = undefined;

    if (this.vaultKeyEncryptionNonce) wipe(this.vaultKeyEncryptionNonce);
    this.vaultKeyEncryptionNonce = undefined;

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

  private async deriveAuthKey(): Promise<Uint8Array> {
    if (!this.sessionSecret) throw new SessionLockedError();
    if (!this.authSalt) throw new SessionLockedError();

    return await hkdf(this.sessionSecret, "sessionAuth", this.authSalt);
  }
}

export const secretsStore = new SecretsStore();
