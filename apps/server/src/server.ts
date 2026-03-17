import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import fastify from "fastify";
import { appRouter, type AppRouter } from "./router";
import cors from "@fastify/cors";
import { opaque } from "./opaque";
import { createContext } from "./context";
import fastifyRedis from "@fastify/redis";

await opaque.ready;

export const server = fastify({
  routerOptions: {
    maxParamLength: 5000,
  },
});

await server.register(fastifyRedis, {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
});

const allowedOrigins = new Set(["localhost"]);
if (process.env.CORS_ORIGIN) {
  try {
    allowedOrigins.add(new URL(process.env.CORS_ORIGIN).hostname);
  } catch {
    // If CORS_ORIGIN is just a hostname without protocol, add it directly
    allowedOrigins.add(process.env.CORS_ORIGIN);
  }
}

await server.register(cors, {
  origin: (origin, cb) => {
    if (!origin) {
      // Allow requests with no Origin header (e.g. same-origin, reverse proxy, non-browser)
      cb(null, true);
      return;
    }

    const hostname = new URL(origin).hostname;
    if (allowedOrigins.has(hostname)) {
      cb(null, true);
      return;
    }
    // Generate an error on other origins, disabling access
    cb(new Error("Not allowed"), false);
  },
  credentials: true,
});

await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }) {
      if (path === "favicon.ico") return;
      // report to error monitoring
      console.error(`Error in tRPC handler on path '${path}':`, error);
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
});
