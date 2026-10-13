import { fromString } from "@repo/util";

export const hkdfInfo = {
  sessionSecret: fromString("session-secret"),
  sessionAuth: fromString("session-auth"),
  emailHashKey: fromString("email-hash-key"),
  emailEncryptionKey: fromString("email-encryption-key"),
  recoveryRootKey: fromString("recovery-root-key"),
  recoveryAuth: fromString("recovery-auth"),
  sealKey: fromString("passmgr/seal/auth/v1"),
  biometricKek: fromString("biometric-kek"),
  opaqueFakeRecordKey: fromString("opaque-fake-record-key"),
  opaqueFakeKeySeed: fromString("opaque-fake-key-seed"),
  opaqueFakeMaskingKey: fromString("opaque-fake-masking-key"),
  totpSecret: fromString("totp-secret"),
  backupCode: fromString("backup-code"),
  opaquePassword: fromString("passmgr/opaque-password/v1"),
  deviceSessionKey: fromString("passmgr/device-session/v1"),
};

export const SESSION_ID_HEADER = "x-session-id";
export const SESSION_TIMESTAMP_HEADER = "x-timestamp";
export const SESSION_SIGNATURE_HEADER = "x-signature";
export const SESSION_NONCE_HEADER = "x-nonce";
// Unsigned label of the client ("Firefox on macOS"), stored with a new session
// so the session list can tell devices apart. Display only.
export const DEVICE_NAME_HEADER = "x-device-name";
// UNAUTHORIZED message for a session signed out from elsewhere (another device
// revoked it, or the password changed): the client locks instead of going offline.
export const SESSION_SIGNED_OUT = "session_signed_out";

// SSE subscriptions can't send headers, so the same four values travel in
// tRPC `connectionParams` (query string). The client's connectionParams
// callback doesn't know the procedure, so the signature covers this fixed
// path and an empty input instead (tRPC also injects `lastEventId` into the
// input on reconnect, which the client can't predict).
export const SUBSCRIPTION_SIGNATURE_PATH = "subscription";
