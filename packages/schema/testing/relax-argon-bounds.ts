import { setArgonBounds } from "../src/user/key-schema";

/**
 * Lets the t:1 m:8 test params (`setPasswordKekParams`) pass `argonParamsSchema`, which
 * checks what comes back from the server, the disk and export files. Called by the test setups.
 */
export function relaxArgonBounds(): void {
  setArgonBounds({ tMin: 1, mMin: 8, mMultipleOf: 1 });
}
