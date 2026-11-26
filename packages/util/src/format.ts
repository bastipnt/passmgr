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

export function fromString(input?: string): Uint8Array {
  return new TextEncoder().encode(input);
}

export function fromBase64(input: string): Uint8Array {
  if (!checkIfBase64(input)) throw new EncodingError();
  if (typeof Uint8Array.fromBase64 === "function") {
    return Uint8Array.fromBase64(input);
  }
  // Hermes (React Native) lacks the TC39 base64 proposal — fall back to atob.
  const bin = atob(input);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Decoders ignore the unused low bits of the last digit, so several strings give the same bytes;
// this takes only the one `toBase64` gives back (undefined otherwise), so input isn't malleable.
export function decodeCanonicalBase64(input: string): Uint8Array | undefined {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(input);
  } catch {
    return undefined;
  }
  return toBase64(bytes) === input ? bytes : undefined;
}

export function toBase64(input: Uint8Array): string {
  if (typeof input.toBase64 === "function") return input.toBase64();
  // Hermes (React Native) fallback via btoa.
  let s = "";
  for (let i = 0; i < input.length; i++) s += String.fromCharCode(input[i]!);
  return btoa(s);
}
