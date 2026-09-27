import react from "@vitejs/plugin-react";
// import tailwindcss from "@tailwindcss/vite";
import path from "path";
import sqlocal from "sqlocal/vite";
import { defineConfig, loadEnv } from "vite";
import { seo } from "./vite-plugin-seo";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    seo(loadEnv(mode, process.cwd()).VITE_SITE_URL),
    sqlocal({ coi: false }),
    {
      name: "coi-headers-credentialless",
      configureServer(server) {
        server.middlewares.use((_, res, next) => {
          res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          next();
        });
      },
    },
  ],
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  worker: {
    format: "es" as const,
  },
}));
