import { defineConfig } from "vitest/config";

export default defineConfig({
  // Pin to this package so `include` resolves correctly when the config
  // is loaded from a different CWD (e.g. Stryker invoking it from repo root).
  root: import.meta.dirname,
  test: {
    environment: "node",
    include: ["test/integration/**/*.int.test.ts"],
    pool: "forks",
    fileParallelism: false,
    // Real Argon2id (~250ms per call) + real container I/O — give plenty of room.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    globalSetup: ["./test/setup/global-setup.ts"],
    setupFiles: ["./test/setup/argon2-fast.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Integration suite owns coverage for the OPAQUE/HMAC flow and the client
      // register/login. Other server paths (subscription procedures, user router,
      // appConfig, context middleware) are exercised only by the HTTP layer or unit
      // tests and are intentionally out of scope here.
      include: [
        "src/auth/login-router.ts",
        "src/auth/registration-router.ts",
        "src/record/router.ts",
        "src/util/redis-utils.ts",
        "../../packages/client/src/register.ts",
        "../../packages/client/src/login.ts",
      ],
      exclude: ["**/*.test.ts"],
      thresholds: {
        // Tracks current state — gate prevents regressions below these numbers.
        lines: 70,
        branches: 50,
        functions: 70,
      },
    },
  },
});
