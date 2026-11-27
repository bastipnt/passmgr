import type { strengthWorkerService as real } from "@repo/crypto/services/strength-worker-service";

/** Without a Worker (jsdom) zxcvbn loads and rates in the test's thread, past the limit under a
 * full run; for `vi.mock` of the strength worker service. Ratings: packages/crypto's tests. */
export const strengthWorkerService: typeof real = {
  rate: async () => null,
  terminate: () => undefined,
};
