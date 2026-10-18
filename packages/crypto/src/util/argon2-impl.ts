// Default Argon2 implementation (web + Node + tests): WASM with a pure-JS
// fallback. Mobile gets a native
// override via the sibling `argon2-impl.native.ts` (Metro picks `.native.ts`
// automatically for iOS/Android bundles).
import {
  type ArgonOpts,
  argon2dAsync as nobleArgon2dAsync,
  argon2idAsync as nobleArgon2idAsync,
} from "@noble/hashes/argon2.js";
import { argon2d as wasmArgon2d, argon2id as wasmArgon2id } from "hash-wasm";

export type { ArgonOpts };

/** Argon2d only for reading KeePass databases (`kdbx.ts`); everything of ours is Argon2id. */
export type Argon2Variant = "argon2id" | "argon2d";

export type Argon2Params = { t: number; m: number; p: number; variant?: Argon2Variant };

const wasm = { argon2id: wasmArgon2id, argon2d: wasmArgon2d };
const noble = { argon2id: nobleArgon2idAsync, argon2d: nobleArgon2dAsync };

let wasmUnavailable = false;

export function wasmArgon2Async(
  variant: Argon2Variant,
  password: Uint8Array | string,
  salt: Uint8Array | string,
  opts: ArgonOpts,
): Promise<Uint8Array> {
  return wasm[variant]({
    password,
    salt,
    iterations: opts.t,
    memorySize: opts.m,
    parallelism: opts.p,
    hashLength: opts.dkLen ?? 32,
    outputType: "binary",
  });
}

export const wasmArgon2idAsync = (
  password: Uint8Array | string,
  salt: Uint8Array | string,
  opts: ArgonOpts,
) => wasmArgon2Async("argon2id", password, salt, opts);

function isWasmFailure(e: unknown): boolean {
  return (
    e instanceof WebAssembly.CompileError ||
    e instanceof WebAssembly.LinkError ||
    e instanceof WebAssembly.RuntimeError ||
    e instanceof RangeError
  );
}

/**
 * WASM Argon2 (hash-wasm, the module is inlined in the bundle), RFC 9106 like
 * @noble and the native one. Falls back to @noble for the rest of this thread's
 * life once the WASM can't run: blocked by a CSP without `'wasm-unsafe-eval'`,
 * or the memory can't grow (128 MiB on a memory-starved mobile Safari). Bad
 * input throws as it is.
 */
export async function argon2Async(
  variant: Argon2Variant,
  password: Uint8Array | string,
  salt: Uint8Array | string,
  opts: ArgonOpts,
): Promise<Uint8Array> {
  if (!wasmUnavailable) {
    try {
      return await wasmArgon2Async(variant, password, salt, opts);
    } catch (e) {
      if (!isWasmFailure(e)) throw e;
      wasmUnavailable = true;
      console.warn("WASM Argon2 unavailable, falling back to JS", e);
    }
  }
  return noble[variant](password, salt, opts);
}

export const argon2idAsync = (
  password: Uint8Array | string,
  salt: Uint8Array | string,
  opts: ArgonOpts,
) => argon2Async("argon2id", password, salt, opts);
