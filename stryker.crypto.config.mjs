// @ts-check

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
const config = {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  packageManager: "pnpm",
  testRunner: "vitest",
  vitest: {
    configFile: "packages/crypto/vitest.config.ts",
    // Vitest's related-file resolution misses tests that go through the
    // @repo/* barrel re-exports in this monorepo; run the full crypto suite.
    related: false,
  },
  coverageAnalysis: "perTest",
  mutate: [
    "packages/crypto/src/**/*.ts",
    "!packages/crypto/src/wordlist-eff-large.ts",
    "!packages/crypto/src/services/**",
    "!packages/crypto/src/workers/**",
    "!packages/crypto/**/*.test.ts",
  ],
  ignorePatterns: ["**/dist/**", "**/coverage/**", "reports/**", ".stryker-tmp/**"],
  disableTypeChecks: true,
  tempDirName: ".stryker-tmp/crypto",
  reporters: ["progress", "html", "json", "clear-text"],
  htmlReporter: { fileName: "reports/mutation/crypto/index.html" },
  jsonReporter: { fileName: "reports/mutation/crypto/mutation.json" },
  thresholds: { high: 95, low: 85, break: 80 },
  timeoutMS: 60000,
};

export default config;
