import cors from "@fastify/cors";
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import fastify from "fastify";
import { type AppRouter, appRouter } from "./router";
import "./opaque";
import rateLimit from "@fastify/rate-limit";
import fastifyRedis from "@fastify/redis";
import { createContext } from "./context";
import { stripQuery } from "./logger";
import { redis } from "./redis";

const isDev = process.env.NODE_ENV !== "production";

// Number of reverse proxy hops to trust for X-Forwarded-For, so `req.ip` (the
// rate-limit key) is the real client rather than the proxy. A hop count instead
// of `true` keeps client-supplied X-Forwarded-For entries from being trusted.
const trustProxy = process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false;

export const server = fastify({
  trustProxy,
  routerOptions: {
    maxParamLength: 5000,
  },
  logger: {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    redact: {
      paths: [
        'req.headers["x-signature"]',
        'req.headers["x-session-id"]',
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
    serializers: {
      // Drop the query string: SSE subscriptions carry session id + signature
      // in `?connectionParams=…`, which must not end up in logs.
      req: (req) => ({
        method: req.method,
        url: stripQuery(req.url),
        host: req.host,
        remoteAddress: req.ip,
        remotePort: req.socket?.remotePort,
      }),
    },
    ...(isDev && { transport: { target: "pino-pretty", options: { colorize: true } } }),
  },
});

await server.register(fastifyRedis, { client: redis });

const AUTH_PATH_RE = /\/(login|register)\.[A-Za-z]+/;

if (process.env.RATE_LIMIT_DISABLED !== "true") {
  await server.register(rateLimit, {
    redis,
    global: true,
    timeWindow: "1 minute",
    max: (req) => (AUTH_PATH_RE.test(req.url) ? 10 : 100),
    keyGenerator: (req) => req.ip,
  });
}

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
    // Omit CORS headers so the browser blocks the response (no 500)
    server.log.warn({ origin }, "cors.rejected");
    cb(null, false);
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
