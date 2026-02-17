/**
 * Type declarations for ES2024 Uint8Array base64 methods
 * These are supported in TypeScript 5.7+ with ES2024 lib
 * Included by all packages in the monorepo
 */

declare global {
  interface Uint8Array {
    /**
     * Converts the Uint8Array to a base64-encoded string
     */
    toBase64(): string;
  }

  interface Uint8ArrayConstructor {
    /**
     * Creates a Uint8Array from a base64-encoded string
     */
    fromBase64(base64: string): Uint8Array;
  }
}

export {};
