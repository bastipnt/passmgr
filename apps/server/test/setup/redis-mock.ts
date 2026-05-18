import IoRedisMock from "ioredis-mock";

/**
 * Build a fresh ioredis-mock instance. Used as the replacement for the real
 * `redis` singleton exported from `apps/server/src/redis.ts` via `vi.mock`.
 */
export function createRedisMock(): IoRedisMock {
  return new IoRedisMock();
}

export { IoRedisMock };
