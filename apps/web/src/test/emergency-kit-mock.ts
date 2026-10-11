import { vi } from "vitest";

/**
 * The real `@repo/client` exports `RecoveryKeyDialog` needs, for suites that
 * mock the package wholesale. Spread into the mock factory:
 * `...(await emergencyKitMocks())`. The server address comes from
 * `renderWithProviders`.
 */
export async function emergencyKitMocks() {
  const [{ recoveryKeyChunks }, { useEmergencyKit }] = await Promise.all([
    vi.importActual<typeof import("@repo/client/src/account/emergency-kit")>(
      "@repo/client/src/account/emergency-kit",
    ),
    vi.importActual<typeof import("@repo/client/src/hooks/use-emergency-kit")>(
      "@repo/client/src/hooks/use-emergency-kit",
    ),
  ]);
  return { recoveryKeyChunks, useEmergencyKit };
}
