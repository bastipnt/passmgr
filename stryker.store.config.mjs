// @ts-check

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
const config = {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  packageManager: "pnpm",
  testRunner: "vitest",
  vitest: {
    configFile: "packages/store/vitest.config.ts",
    related: false,
  },
  coverageAnalysis: "perTest",
  mutate: ["packages/store/src/secrets-store.ts"],
  ignorePatterns: ["**/dist/**", "**/coverage/**", "reports/**", ".stryker-tmp/**"],
  disableTypeChecks: true,
  tempDirName: ".stryker-tmp/store",
  reporters: ["progress", "html", "json", "clear-text"],
  htmlReporter: { fileName: "reports/mutation/store/index.html" },
  jsonReporter: { fileName: "reports/mutation/store/mutation.json" },
  thresholds: { high: 95, low: 85, break: 80 },
  timeoutMS: 60000,
};

export default config;
