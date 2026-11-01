import { playwright } from "@vitest/browser-playwright";
import sqlocal from "sqlocal/vite";
import { defineConfig } from "vitest/config";

// The web driver against real SQLocal (OPFS, worker), like the web app runs it.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [sqlocal({ coi: false })],
  test: {
    include: ["test/browser/**/*.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
