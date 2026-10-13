export * from "./src/autofill";
export type { OpenDatabase, SqlDriver } from "./src/driver";
export { createLock, type Lock } from "./src/lock";
export * from "./src/profiles";
export {
  type BreachCheck,
  type BreachCheckVersion,
  breachCheckKey,
} from "./src/schema/breach-schema";
export {
  type ConflictResolver,
  type LocalRecordChange,
  type LocalRecordVersion,
  type PendingChange,
  type RecordCiphertext,
  type RecordConflict,
  RecordWriteError,
  type ReencryptedVersion,
} from "./src/schema/outbox-schema";
export type { LocalProfile, ProfileMode } from "./src/schema/profile-schema";
export type { RecordHead } from "./src/schema/records-schema";
export type { RevokedRecord, RevokedVault } from "./src/schema/revoked-schema";
export * from "./src/secrets-store";
export * from "./src/session-persistence";
export * from "./src/vault";
