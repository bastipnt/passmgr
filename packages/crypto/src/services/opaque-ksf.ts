// The web runs the KSF in the Argon2 worker (packages/crypto/CLAUDE.md, OPAQUE KSF).
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
