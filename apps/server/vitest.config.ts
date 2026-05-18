import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // testcontainers + opaque WASM init need process isolation
    pool: "forks",
    // All server-side suites share one Postgres container; run files sequentially
    // so per-test truncateAll() in one file doesn't wipe another file's mid-test rows.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    globalSetup: ["./test/setup/global-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/events/**"],
      thresholds: {
        "src/auth/**": { lines: 95, branches: 95, functions: 95 },
        lines: 80,
        branches: 75,
        functions: 80,
      },
    },
  },
});
