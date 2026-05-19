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
  mutate: [
    "apps/server/src/auth/**/*.ts",
    "!apps/server/src/auth/**/*.test.ts",
  ],
  ignorePatterns: ["**/dist/**", "**/coverage/**", "reports/**", ".stryker-tmp/**"],
  disableTypeChecks: true,
  tempDirName: ".stryker-tmp/server-auth",
  // Each Stryker worker spawns its own Postgres + Redis pair via the
  // server integration global-setup. Two parallel workers is the safe
  // ceiling on a standard GitHub Actions runner.
  concurrency: 2,
  // Integration suite runs real Argon2id (fast-params) + container I/O.
  timeoutMS: 180000,
  reporters: ["progress", "html", "json", "clear-text"],
  htmlReporter: { fileName: "reports/mutation/server-auth/index.html" },
  jsonReporter: { fileName: "reports/mutation/server-auth/mutation.json" },
  thresholds: { high: 95, low: 85, break: 80 },
};

export default config;
