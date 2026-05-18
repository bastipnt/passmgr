import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/schema/**", "src/vault.ts"],
      thresholds: {
        // 90% branch threshold accommodates two defensive guards in deriveAuthKey
        // that are unreachable from public callers (sessionSecret / authSalt are
        // always populated together by unlockSession).
        "src/secrets-store.ts": { lines: 95, branches: 90, functions: 95 },
        lines: 80,
        branches: 75,
        functions: 80,
      },
    },
  },
});
