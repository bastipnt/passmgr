import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { webAlias } from "./alias";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: webAlias,
  },
  define: {
    "import.meta.env.VITE_SERVER_URL": JSON.stringify("http://localhost/trpc"),
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["./src/test/setup.ts"],
    // Node 25+ ships its own `localStorage` global (undefined without
    // `--localstorage-file`), which shadows jsdom's.
    execArgv: ["--no-experimental-webstorage"],
    testTimeout: 10_000,
    mockReset: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/features/auth/**", "src/features/records/login/**"],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 80,
      },
    },
  },
});
