import { vi } from "vitest";

/**
 * The real `@repo/client` exports the password generator needs (the "Generate"
 * action of a new password), for suites that mock the package wholesale.
 */
export async function passwordGeneratorMocks() {
  const [{ useGeneratorDefaults }, { ShortcutLayer }] = await Promise.all([
    vi.importActual<typeof import("@repo/client/src/hooks/use-generator-defaults")>(
      "@repo/client/src/hooks/use-generator-defaults",
    ),
    vi.importActual<typeof import("@repo/client/src/providers/ShortcutProvider")>(
      "@repo/client/src/providers/ShortcutProvider",
    ),
  ]);
  return { useGeneratorDefaults, ShortcutLayer };
}
