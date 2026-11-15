import type { FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import type { FastifyBaseLogger } from "fastify";
import { createContext } from "./context";
import { type AppRouter, appRouter } from "./router";

export function createTrpcOptions(
  fallbackLog: FastifyBaseLogger,
): FastifyTRPCPluginOptions<AppRouter>["trpcOptions"] {
  return {
    router: appRouter,
    createContext,
    // A batch is one HTTP request to the per-IP rate limit but runs every call in it.
    allowBatching: false,
    onError({ path, error, ctx }) {
      if (path === "favicon.ico") return;
      const log = ctx?.req?.log ?? fallbackLog;
      log.error({ path, code: error.code, err: error }, "trpc.error");
    },
  };
}
