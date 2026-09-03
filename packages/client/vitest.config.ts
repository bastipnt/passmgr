import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Only the pure record helpers are unit-tested here; the hooks and
      // providers need a React environment and are covered by the apps.
      include: ["src/records/**/*.ts"],
    },
  },
});
