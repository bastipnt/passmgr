import type { PushChange } from "./record-payload";

/** Characters, per field of a record payload. */
export const MAX_TITLE_LENGTH = 256;
export const MAX_FIELD_LENGTH = 1024;
export const MAX_URL_LENGTH = 2048;
/** SSH keys, API secrets, custom field values: room for a 16k-bit RSA key in PEM. */
export const MAX_LONG_TEXT_LENGTH = 16_384;
export const MAX_NOTE_LENGTH = 32_768;

/** Items per list of a record payload. */
export const MAX_WEBSITES = 50;
export const MAX_CUSTOM_FIELDS = 100;

/**
 * UTF-8 bytes of one record's payload JSON (`recordPayloadJson`). The field limits alone allow more
 * (many custom fields), so the whole payload is checked before it's encrypted.
 */
export const MAX_RECORD_PAYLOAD_BYTES = 128 * 1024;

const POLY1305_TAG_BYTES = 16;

/** The base64 ciphertext of the largest payload: what `record.push` accepts. */
export const MAX_ENCRYPTED_RECORD_LENGTH =
  4 * Math.ceil((MAX_RECORD_PAYLOAD_BYTES + POLY1305_TAG_BYTES) / 3);

/** The server's request body limit. */
export const MAX_REQUEST_BYTES = 1024 * 1024;

/**
 * What one push batch may carry, counted by `pushChangeBytes`; the rest of
 * `MAX_REQUEST_BYTES` covers the JSON around the ciphertexts.
 */
export const MAX_PUSH_BYTES = 768 * 1024;

/**
 * An estimate of a change's ids, timestamps and nonce, in a push or in storage;
 * the headroom below `MAX_REQUEST_BYTES` absorbs what it misses.
 */
export const RECORD_VERSION_OVERHEAD_BYTES = 256;

/** A push change's (or a stored version's) size against `MAX_PUSH_BYTES` and the storage quota. */
export function pushChangeBytes(change: PushChange | { encryptedData: string }): number {
  return (
    ("encryptedData" in change ? change.encryptedData.length : 0) + RECORD_VERSION_OVERHEAD_BYTES
  );
}

export class RecordTooLargeError extends Error {
  constructor() {
    super(
      `An item can hold at most ${MAX_RECORD_PAYLOAD_BYTES / 1024} KB. Shorten its notes or fields.`,
    );
    this.name = "RecordTooLargeError";
  }
}

export function recordPayloadBytes(json: string): number {
  return new TextEncoder().encode(json).length;
}
