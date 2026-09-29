import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
// import tailwindcss from "@tailwindcss/vite";
import path from "path";
import sqlocal from "sqlocal/vite";
import { defineConfig, loadEnv } from "vite";
import { seo } from "./vite-plugin-seo";

// `--mode lan` (pnpm dev:host): serve over HTTPS so LAN devices get a secure
// context (crypto.subtle / randomUUID), and proxy the API through Vite so they
// never have to reach the server's localhost URL.
const LAN_API_PREFIX = "/api";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const lan = mode === "lan";

  return {
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins: [
      react(),
      seo(env.VITE_SITE_URL),
      lan && basicSsl(),
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
    ...(lan && {
      define: {
        "import.meta.env.VITE_SERVER_URL": JSON.stringify(LAN_API_PREFIX),
      },
      server: {
        proxy: {
          [LAN_API_PREFIX]: {
            target: env.VITE_SERVER_URL,
            changeOrigin: true,
            rewrite: (p: string) => p.slice(LAN_API_PREFIX.length),
          },
        },
      },
    }),
  };
});
