// Native Argon2id implementation for React Native via react-native-argon2
// (libsodium under the hood). Replaces the pure-JS @noble/hashes/argon2 on
// mobile — ~50× faster, so vault-unlock at login doesn't lock the UI thread.
// Metro auto-picks this file over `argon2-impl.ts` for ios/android bundles.

import argon2 from "react-native-argon2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export type { ArgonOpts } from "@noble/hashes/argon2.js";

import type { ArgonOpts } from "@noble/hashes/argon2.js";

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
