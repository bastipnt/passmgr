import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["test/integration/**", "**/node_modules/**", "**/dist/**"],
    // testcontainers + opaque WASM init need process isolation
    pool: "forks",
    // All server-side suites share one Postgres container; run files sequentially
    // so per-test truncateAll() in one file doesn't wipe another file's mid-test rows.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    globalSetup: ["./test/setup/global-setup.ts"],
    setupFiles: ["./test/setup/argon2-fast.ts"],
    // Coverage for the server is enforced by the integration suite
    // (vitest.integration.config.ts); the slimmed unit suite only exercises
    // narrow edge-case branches and would never meet a breadth threshold.
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/events/**"],
    },
  },
});
