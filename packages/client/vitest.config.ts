import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Real OPAQUE + key derivation: ~1s alone, several times that while turbo
    // runs every package's tests at once.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Only the pure record helpers, the registration flow and the sync manager
      // are unit-tested here; the hooks and providers need a React environment
      // and are covered by the apps.
      include: [
        "src/records/**/*.ts",
        "src/account/*.ts",
        "src/register.ts",
        "src/sync-manager.ts",
      ],
    },
  },
});
