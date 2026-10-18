// Native Argon2id implementation for React Native via react-native-argon2.
// Backed by the reference Argon2 (argon2kt on Android, Argon2Swift on iOS) —
// RFC 9106 compliant, so output is byte-identical to the WASM / @noble one in
// `argon2-impl.ts`, including parallelism p>1. Replaces it on mobile, so
// vault-unlock at login doesn't lock the UI thread. `argon2Async` sends what the
// native library can't take (Argon2d, binary passwords) to @noble on the JS thread.
// Metro auto-picks this file over `argon2-impl.ts` for ios/android bundles.

import { argon2dAsync, argon2idAsync as nobleArgon2idAsync } from "@noble/hashes/argon2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import argon2 from "react-native-argon2";

export type { ArgonOpts } from "@noble/hashes/argon2.js";

import type { ArgonOpts } from "@noble/hashes/argon2.js";
import type { Argon2Variant } from "./argon2-impl";

const enc = new TextDecoder();

export async function argon2idAsync(
  password: Uint8Array | string,
  salt: Uint8Array | string,
  opts: ArgonOpts,
): Promise<Uint8Array> {
  const pwd = typeof password === "string" ? password : enc.decode(password);
  const saltHex =
    typeof salt === "string" ? Buffer.from(salt, "utf8").toString("hex") : bytesToHex(salt);

  const { rawHash } = await argon2(pwd, saltHex, {
    iterations: opts.t,
    memory: opts.m,
    parallelism: opts.p,
    hashLength: opts.dkLen ?? 32,
    mode: "argon2id",
    saltEncoding: "hex",
  });

  return hexToBytes(rawHash);
}

/**
 * react-native-argon2 takes the password as a string only, so binary
 * passwords (a KeePass composite key) and Argon2d run on @noble.
 */
export function argon2Async(
  variant: Argon2Variant,
  password: Uint8Array | string,
  salt: Uint8Array | string,
  opts: ArgonOpts,
): Promise<Uint8Array> {
  if (variant === "argon2id" && typeof password === "string")
    return argon2idAsync(password, salt, opts);
  return (variant === "argon2d" ? argon2dAsync : nobleArgon2idAsync)(password, salt, opts);
}
