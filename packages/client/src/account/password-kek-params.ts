import { calibratePasswordKekParams, getPasswordKekParams } from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import type { ArgonParams } from "@repo/schema";

let calibration: Promise<ArgonParams> | undefined;

/**
 * This device's Argon2 params for a new password wrap, measured once per app
 * run. A failed measurement keeps the strongest set and is retried next time.
 */
export function devicePasswordKekParams(): Promise<ArgonParams> {
  calibration ??= calibratePasswordKekParams((salt, params) =>
    argon2WorkerService.derive("calibration", salt, params),
  ).catch((e: unknown) => {
    calibration = undefined;
    console.error("Argon2 calibration failed", e);
    return getPasswordKekParams();
  });
  return calibration;
}
