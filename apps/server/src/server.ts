import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
// import { fastifyRedis } from "@fastify/redis";
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

await server.register(cors, {
  origin: (origin, cb) => {
    if (!origin) {
      cb(new Error("Not allowed"), false);
      // cb(null, true);
      return;
    }

    const hostname = new URL(origin).hostname;
    if (hostname === "localhost") {
      //  Request from localhost will pass
      cb(null, true);
      return;
    }
    // Generate an error on other origins, disabling access
    cb(new Error("Not allowed"), false);
  },
  credentials: true,
});

await server.register(fastifyTRPCPlugin, {
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
