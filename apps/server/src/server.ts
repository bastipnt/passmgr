import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import fastify from "fastify";
import { appRouter, type AppRouter } from "./router";
import cors from "@fastify/cors";
import { opaque } from "./opaque";
import { createContext } from "./context";
import fastifyRedis from "@fastify/redis";
import rateLimit from "@fastify/rate-limit";
import { redis } from "./redis";

await opaque.ready;

const isDev = process.env.NODE_ENV !== "production";

export const server = fastify({
  routerOptions: {
    maxParamLength: 5000,
  },
  logger: {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    redact: {
      paths: [
        'req.headers["x-signature"]',
        "req.headers.authorization",
        "req.headers.cookie",
        "*.email",
        "*.startLoginRequest",
        "*.finishLoginRequest",
        "*.startRegistrationRequest",
        "*.registrationRecord",
        "*.recoveryKey",
        "*.passwordKekSalt",
        "*.userKeys",
      ],
      censor: "[REDACTED]",
    },
    ...(isDev && { transport: { target: "pino-pretty", options: { colorize: true } } }),
  },
});

await server.register(fastifyRedis, { client: redis });

const AUTH_PATH_RE = /\/(login|register)\.[A-Za-z]+/;

await server.register(rateLimit, {
  redis,
  global: true,
  timeWindow: "1 minute",
  max: (req) => (AUTH_PATH_RE.test(req.url) ? 10 : 100),
  keyGenerator: (req) => req.ip,
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
  prefix: process.env.PREFIX,
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error, ctx }) {
      if (path === "favicon.ico") return;
      const log = ctx?.req?.log ?? server.log;
      log.error({ path, code: error.code, err: error }, "trpc.error");
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
});
