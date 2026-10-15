// Default Argon2id implementation (web + Node + tests): WASM with a pure-JS
// fallback. Mobile gets a native
// override via the sibling `argon2-impl.native.ts` (Metro picks `.native.ts`
// automatically for iOS/Android bundles).
import { type ArgonOpts, argon2idAsync as nobleArgon2idAsync } from "@noble/hashes/argon2.js";
import { argon2id as wasmArgon2id } from "hash-wasm";

export type { ArgonOpts };

let wasmUnavailable = false;

export function wasmArgon2idAsync(
  password: Uint8Array | string,
  salt: Uint8Array | string,
  opts: ArgonOpts,
): Promise<Uint8Array> {
  return wasmArgon2id({
    password,
    salt,
    iterations: opts.t,
    memorySize: opts.m,
    parallelism: opts.p,
    hashLength: opts.dkLen ?? 32,
    outputType: "binary",
  });
}

function isWasmFailure(e: unknown): boolean {
  return (
    e instanceof WebAssembly.CompileError ||
    e instanceof WebAssembly.LinkError ||
    e instanceof WebAssembly.RuntimeError ||
    e instanceof RangeError
  );
}

/**
 * WASM Argon2id (hash-wasm, the module is inlined in the bundle), RFC 9106 like
 * @noble and the native one. Falls back to @noble for the rest of this thread's
 * life once the WASM can't run: blocked by a CSP without `'wasm-unsafe-eval'`,
 * or the memory can't grow (128 MiB on a memory-starved mobile Safari). Bad
 * input throws as it is.
 */
export async function argon2idAsync(
  password: Uint8Array | string,
  salt: Uint8Array | string,
  opts: ArgonOpts,
): Promise<Uint8Array> {
  if (!wasmUnavailable) {
    try {
      return await wasmArgon2idAsync(password, salt, opts);
    } catch (e) {
      if (!isWasmFailure(e)) throw e;
      wasmUnavailable = true;
      console.warn("WASM Argon2 unavailable, falling back to JS", e);
    }
  }
  return nobleArgon2idAsync(password, salt, opts);
}
