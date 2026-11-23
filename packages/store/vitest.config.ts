import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Pin to this package so `include` resolves correctly when the config
  // is loaded from a different CWD (e.g. Stryker invoking it from repo root).
  root: import.meta.dirname,
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/browser/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/migrations.generated.ts", "src/schema/tables.ts"],
      thresholds: {
        "src/secrets-store.ts": { lines: 95, branches: 95, functions: 95 },
        lines: 80,
        branches: 75,
        functions: 80,
      },
    },
  },
});
