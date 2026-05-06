import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// import tailwindcss from "@tailwindcss/vite";
import path from "path";
import sqlocal from "sqlocal/vite";

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@pages": path.resolve(__dirname, "./src/pages"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@features": path.resolve(__dirname, "./src/features"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
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
});
