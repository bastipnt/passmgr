// The web runs the KSF in the Argon2 worker (packages/crypto/CLAUDE.md, OPAQUE KSF).
import { opaqueScrypt } from "../util/opaque-scrypt";
import { runOffThread } from "../util/worker-client";
import { argon2WorkerService } from "./argon2-worker-service";

export interface OpaqueKsf {
  readonly name: string;
  readonly harden: (input: Uint8Array) => Uint8Array | Promise<Uint8Array>;
}

export const opaqueKsf: OpaqueKsf = {
  name: "scrypt",
  // The Node fallback is chosen here, not in the service, so a test that mocks the service still runs.
  harden: (input) =>
    runOffThread(
      () => argon2WorkerService.opaqueKsf(input),
      () => opaqueScrypt(input),
    ),
};
