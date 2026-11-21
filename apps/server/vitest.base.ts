import { defineConfig } from "vitest/config";

export const serverVitestBase = defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    fileParallelism: false,
    globalSetup: ["./test/setup/global-setup.ts"],
    setupFiles: ["./test/setup/argon2-fast.ts"],
    // @repo/db loads apps/server/.env via dotenv/config; dotenv never overrides
    // vars already set, so pin flags here to keep a local dev .env from leaking in.
    env: {
      REGISTRATION_DISABLED: "false",
      SMTP_URL: "",
      APP_VERSION: "",
      CLIENT_VERSIONS: "v1.2.3",
    },
  },
});
