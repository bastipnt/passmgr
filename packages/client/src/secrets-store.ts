import { fromBase64, fromString, hkdf, signHmac, wipe } from "@repo/crypto";
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

  async unlock(
    sessionId: string,
    sessionKey: string,
    authSalt: Uint8Array,
    userPasswordKeys: PasswordKeySchema,
  ) {
    this.sessionId = sessionId;
    this.sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
    this.authSalt = authSalt;
    this.authKey = await this.deriveAuthKey();

    this.passwordKekParams = userPasswordKeys.passwordKekParams;
    this.passwordKekSalt = fromBase64(userPasswordKeys.passwordKekSalt);
    this.encryptedVaultKey = fromBase64(userPasswordKeys.encryptedVaultKey);
    this.vaultKeyEncryptionNonce = fromBase64(userPasswordKeys.vaultKeyEncryptionNonce);
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
  }

  async signRequest(message: string) {
    if (!this.authKey) throw new SessionLockedError();
    return await signHmac(this.authKey, message);
  }

  private async deriveAuthKey(): Promise<Uint8Array> {
    if (!this.sessionSecret) throw new SessionLockedError();
    if (!this.authSalt) throw new SessionLockedError();

    return await hkdf(this.sessionSecret, "sessionAuth", this.authSalt);
  }
}

export const secretsStore = new SecretsStore();
