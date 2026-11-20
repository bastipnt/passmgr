import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // Real OPAQUE + key derivation: ~1s alone, several times that while turbo
    // runs every package's tests at once.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Most hooks need the app's providers and are covered by the apps; one tested here opts into
      // jsdom: see docs/testing.md (Layer 1).
      include: [
        "src/records/**/*.ts",
        "src/account/*.ts",
        "src/register.ts",
        "src/sync-manager.ts",
        "src/hooks/use-vault-settings.ts",
        "src/vaults/vault-settings.ts",
      ],
    },
  },
});
