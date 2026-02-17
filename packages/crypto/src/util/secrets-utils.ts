import { randomBytes } from "@noble/hashes/utils.js";

export function wipe(buf: Uint8Array) {
  buf.fill(0);
}

export function genSalt() {
  return randomBytes(32);
}
