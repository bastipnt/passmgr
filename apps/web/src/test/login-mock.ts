import { vi } from "vitest";

/**
 * The OPAQUE handshake of `@repo/client/src/login` as one mock, for both entries: a typed
 * password (`loginUser`) or the kept OPAQUE password (`loginWithOpaquePassword`, connect).
 * Spread into the mock factory over the real module: `...(await loginMocks())`.
 */
export async function loginMocks() {
  const login = vi.fn();
  return {
    ...(await vi.importActual<typeof import("@repo/client/src/login")>("@repo/client/src/login")),
    loginUser: login,
    loginWithOpaquePassword: login,
  };
}
