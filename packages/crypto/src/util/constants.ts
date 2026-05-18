import { fromString } from "@repo/util";

export const hkdfInfo = {
  sessionSecret: fromString("session-secret"),
  sessionAuth: fromString("session-auth"),
  emailHashKey: fromString("email-hash-key"),
  emailEncryptionKey: fromString("email-encryption-key"),
  recoveryRootKey: fromString("recovery-root-key"),
  biometricKek: fromString("biometric-kek"),
};

export const SESSION_ID_HEADER = "x-session-id";
export const SESSION_TIMESTAMP_HEADER = "x-timestamp";
export const SESSION_SIGNATURE_HEADER = "x-signature";
export const SESSION_SALT_HEADER = "x-salt";
export const SESSION_NONCE_HEADER = "x-nonce";
