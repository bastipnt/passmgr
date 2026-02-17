class EncodingError extends Error {
  override message: string = "Wrong encoding";
}

/**
 * Posted by Philzen, modified by community. See post 'Timeline' for change history
 * Retrieved 2026-02-17, License - CC BY-SA 4.0
 * @see https://stackoverflow.com/a/35002237
 *
 * @param testStr
 * @returns boolean
 */
function checkIfBase64(testStr: string): boolean {
  var base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  return base64regex.test(testStr);
}

export function fromString(input?: string): Uint8Array {
  return new TextEncoder().encode(input);
}

export function fromBase64(input: Base64URLString): Uint8Array {
  if (!checkIfBase64(input)) throw new EncodingError();
  return Uint8Array.fromBase64(input);
}

export function toBase64(input: Uint8Array): Base64URLString {
  return input.toBase64();
}

export function toBuffer(input: Uint8Array): ArrayBufferLike {
  return input.buffer;
}
