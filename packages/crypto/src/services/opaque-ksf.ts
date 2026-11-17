// OPAQUE key-stretching function (KSF), web/default variant.
//
// Injected into OpaqueClient in place of the library's ScryptMemHardFn (same
// value, `opaqueScrypt`). Pure-JS scrypt over 32 MB takes seconds, so the web
// runs it in the Argon2 worker; our patch of @cloudflare/opaque-ts awaits
// `harden`. The mobile (.native.ts) variant swaps in native scrypt.
import { opaqueScrypt } from "../util/opaque-scrypt";
import { argon2WorkerService } from "./argon2-worker-service";

export interface OpaqueKsf {
  readonly name: string;
  readonly harden: (input: Uint8Array) => Uint8Array | Promise<Uint8Array>;
}

export const opaqueKsf: OpaqueKsf = {
  name: "scrypt",
  // Node (tests, scripts) has no Worker; checked here so a test that mocks the service still runs.
  harden: (input) =>
    typeof Worker === "undefined" ? opaqueScrypt(input) : argon2WorkerService.opaqueKsf(input),
};
