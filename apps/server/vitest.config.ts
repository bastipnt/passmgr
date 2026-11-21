import { defineConfig, mergeConfig } from "vitest/config";
import { serverVitestBase } from "./vitest.base";

export default mergeConfig(
  serverVitestBase,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts", "test/**/*.test.ts"],
      exclude: ["test/integration/**", "**/node_modules/**", "**/dist/**"],
      testTimeout: 60_000,
      hookTimeout: 120_000,
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
  }),
);
