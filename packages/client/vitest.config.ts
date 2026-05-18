import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // testcontainers + opaque WASM init need process isolation
    pool: "forks",
    // packages/client tests share apps/server's Postgres container via globalSetup;
    // run files sequentially so per-test truncateAll() doesn't wipe another file's mid-test rows.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    globalSetup: ["../../apps/server/test/setup/global-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/hooks/**",
        "src/providers/**",
        "src/util/trpc.ts",
        "src/sync-manager.ts",
        "src/tinykeys.d.ts",
      ],
      thresholds: {
        // strict bar for register/login per strategy doc
        "src/register.ts": { lines: 95, branches: 95, functions: 95 },
        "src/login.ts": { lines: 95, branches: 95, functions: 95 },
        lines: 80,
        branches: 75,
        functions: 80,
      },
    },
  },
});
