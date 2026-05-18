import { vi } from "vitest";

/**
 * Factory for `vi.mock("@repo/crypto", cryptoMockFactory)`.
 *
 * Stubs `genPasswordKek` (Argon2id — the dominant test-runtime cost) with a
 * cheap shim that returns the production Argon2 params, so the userKeys
 * payload still satisfies the server's zod validation in
 * `packages/schema/src/user/key-schema.ts`.
 *
 * `wipe` is wrapped in `vi.fn` for tests that assert on call counts;
 * everything else is passed through from the real module.
 */
export async function cryptoMockFactory() {
  const actual = await vi.importActual<typeof import("@repo/crypto")>("@repo/crypto");
  return {
    ...actual,
    wipe: vi.fn(actual.wipe),
    genPasswordKek: vi.fn(async (_password: string) => ({
      passwordKek: actual.genKey(),
      passwordKekParams: { t: 3, m: 128 * 1024, p: 1 },
      passwordKekSaltData: actual.genSalt(),
    })),
  };
}
