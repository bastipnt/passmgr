/**
 * Type-only stub for @repo/crypto/services/* on mobile.
 *
 * The real files use Vite `?worker` imports for relative paths, which TS
 * (with `moduleResolution: bundler`, no project references) cannot resolve
 * via ambient wildcard declarations. Mobile auth-only flow never calls
 * these services, so a type-only stub is sufficient.
 *
 * Wired via `paths` in tsconfig.json. Metro resolves the real modules at
 * bundle time (the `?worker` imports inside them are aliased to a stub by
 * metro.config.js).
 */
import type { ArgonOpts } from "@noble/hashes/argon2.js";
import type { RecordSchema } from "@repo/schema";

export declare const argon2WorkerService: {
  derive(password: string, salt: Uint8Array, params: ArgonOpts): Promise<Uint8Array>;
};

export declare const decryptWorkerService: {
  init(vaultKeyBytes: Uint8Array): void;
  decrypt(encryptedData: string, nonce: string): Promise<RecordSchema>;
  wipe(): void;
};
