import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.int.test.ts"],
    pool: "forks",
    fileParallelism: false,
    // Real Argon2id (~250ms per call) + real container I/O — give plenty of room.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    globalSetup: ["./test/setup/global-setup.integration.ts"],
  },
});
