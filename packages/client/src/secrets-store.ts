import { fromString, hkdf, signHmac, wipe } from "@repo/crypto";

class SessionLockedError extends Error {
  override message: string = "SessionLockedError";
}

class SecretsStore {
  sessionId?: string;
  private sessionSecret?: Uint8Array;
  private authKey?: Uint8Array;
  private salt?: Uint8Array;

  async unlock(sessionId: string, sessionKey: string, salt: Uint8Array) {
    this.sessionId = sessionId;
    this.sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
    this.salt = salt;
    this.authKey = await this.deriveAuthKey();
  }

  lock() {
    this.sessionId = undefined;

    if (this.sessionSecret) wipe(this.sessionSecret);
    this.sessionSecret = undefined;

    if (this.authKey) wipe(this.authKey);
    this.authKey = undefined;

    if (this.salt) wipe(this.salt);
    this.salt = undefined;
  }

  async signRequest(message: string) {
    if (!this.authKey) throw new SessionLockedError();
    return await signHmac(this.authKey, message);
  }

  private async deriveAuthKey(): Promise<Uint8Array> {
    if (!this.sessionSecret) throw new SessionLockedError();
    if (!this.salt) throw new SessionLockedError();

    return await hkdf(this.sessionSecret, "sessionAuth", this.salt);
  }
}

export const secretsStore = new SecretsStore();
