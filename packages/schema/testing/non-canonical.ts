const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** The bytes of padded base64 `b64`, spelled with an unused low bit of its last digit set. */
export function nonCanonicalBase64(b64: string): string {
  const last = b64.indexOf("=") - 1;
  if (last < 0) throw new Error("no padding: every bit of the last digit is used");
  const flipped = ALPHABET[ALPHABET.indexOf(b64[last]!) ^ 0b01]!;
  return b64.slice(0, last) + flipped + b64.slice(last + 1);
}
