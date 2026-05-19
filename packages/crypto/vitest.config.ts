import { defineConfig } from "vitest/config";

export default defineConfig({
  // Pin to this package so `include` resolves correctly when the config
  // is loaded from a different CWD (e.g. Stryker invoking it from repo root).
  root: import.meta.dirname,
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/wordlist-eff-large.ts",
        // Vite ?worker imports — exercised by the web app, not by node-side unit tests.
        "src/services/**",
        "src/workers/**",
      ],
      thresholds: {
        lines: 95,
        branches: 95,
        functions: 95,
      },
    },
  },
});
