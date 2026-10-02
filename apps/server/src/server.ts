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

// Comma-separated IPs/CIDRs (or proxy-addr names like `loopback`, `uniquelocal`)
// of the reverse proxies whose X-Forwarded-For to trust, so `req.ip` (the
// rate-limit key) is the real client rather than the proxy. Fastify >=5.12 no
// longer supports hop counts (it would silently trust nothing), so reject them.
const trustProxyEnv = process.env.TRUST_PROXY?.trim();
if (trustProxyEnv && /^\d+$/.test(trustProxyEnv)) {
  throw new Error(
    "TRUST_PROXY must list proxy IPs/CIDRs (e.g. `loopback,uniquelocal`), not a hop count",
  );
}
const trustProxy = trustProxyEnv || false;

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
        "*.recoveryAuthKey",
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

const AUTH_PATH_RE = /\/(login|register|recovery)\.[A-Za-z]+/;

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
