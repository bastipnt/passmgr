/**
 * Format utilities for encoding/decoding
 */

class EncodingError extends Error {
  override message: string = "Wrong encoding";
}

/**
 * Check if a string is valid base64
 * Posted by Philzen, modified by community. See post 'Timeline' for change history
 * Retrieved 2026-02-17, License - CC BY-SA 4.0
 * @see https://stackoverflow.com/a/35002237
 */
function checkIfBase64(testStr: string): boolean {
  const base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  return base64regex.test(testStr);
}

/**
 * Convert a string to Uint8Array
 */
export function fromString(input?: string): Uint8Array {
  return new TextEncoder().encode(input);
}

/**
 * Convert base64 string to Uint8Array
 */
export function fromBase64(input: string): Uint8Array {
  if (!checkIfBase64(input)) throw new EncodingError();
  return Uint8Array.fromBase64(input);
}

/**
 * Convert Uint8Array to base64 string
 */
export function toBase64(input: Uint8Array): string {
  return input.toBase64();
}

/**
 * Convert Uint8Array to ArrayBuffer
 */
export function toBuffer(input: Uint8Array): ArrayBufferLike {
  return input.buffer;
}
