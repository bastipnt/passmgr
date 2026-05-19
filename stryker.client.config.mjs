// @ts-check

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
const config = {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  packageManager: "pnpm",
  testRunner: "vitest",
  vitest: {
    configFile: "apps/server/vitest.integration.config.ts",
    related: false,
  },
  coverageAnalysis: "perTest",
  mutate: ["packages/client/src/register.ts", "packages/client/src/login.ts"],
  ignorePatterns: ["**/dist/**", "**/coverage/**", "reports/**", ".stryker-tmp/**"],
  disableTypeChecks: true,
  tempDirName: ".stryker-tmp/client",
  concurrency: 2,
  timeoutMS: 180000,
  reporters: ["progress", "html", "json", "clear-text"],
  htmlReporter: { fileName: "reports/mutation/client/index.html" },
  jsonReporter: { fileName: "reports/mutation/client/mutation.json" },
  thresholds: { high: 95, low: 85, break: 80 },
};

export default config;
