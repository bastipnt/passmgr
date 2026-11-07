import cors from "@fastify/cors";
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import fastify from "fastify";
import { type AppRouter, appRouter } from "./router";
import "./opaque";
import rateLimit from "@fastify/rate-limit";
import fastifyRedis from "@fastify/redis";
import { db } from "@repo/db";
import { MAX_REQUEST_BYTES } from "@repo/schema";
import { sql } from "drizzle-orm";
import { registerActiveUsersGauge } from "./active-users";
import { createContext } from "./context";
import { registerHealthRoutes } from "./health";
import { logRedact, logSerializers } from "./log-options";
import { metricsRegistry, recordRateLimited } from "./metrics";
import { redis } from "./redis";
import { purgeUnverifiedAccounts } from "./user/email-verification";
import { allowedOrigins } from "./util/allowed-origins";

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
  bodyLimit: MAX_REQUEST_BYTES,
  routerOptions: {
    maxParamLength: 5000,
  },
  logger: {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    redact: logRedact,
    serializers: logSerializers,
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
    onExceeded: () => recordRateLimited("ip"),
  });
}

await server.register(cors, {
  origin: (origin, cb) => {
    if (!origin) {
      // Allow requests with no Origin header (e.g. same-origin, reverse proxy, non-browser)
      cb(null, true);
      return;
    }

    if (allowedOrigins.has(origin)) {
      cb(null, true);
      return;
    }
    // Omit CORS headers so the browser blocks the response (no 500)
    server.log.warn({ origin }, "cors.rejected");
    cb(null, false);
  },
  credentials: true,
});

registerHealthRoutes(server, {
  checks: {
    db: () => db.execute(sql`select 1`),
    // ioredis queues commands while disconnected; a probe must not pile up there.
    redis: () =>
      redis.status === "ready" ? redis.ping() : Promise.reject(new Error(`redis ${redis.status}`)),
  },
  registry: metricsRegistry,
});

registerActiveUsersGauge(metricsRegistry, (err) =>
  server.log.warn({ err }, "metrics.active_users_failed"),
);

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

const PURGE_INTERVAL_MS = 60 * 60_000;

async function runPurge() {
  try {
    const { purged, failed } = await purgeUnverifiedAccounts();
    if (purged > 0 || failed > 0) server.log.info({ purged, failed }, "auth.unverified.purged");
  } catch (err) {
    server.log.error({ err }, "auth.unverified.purge_failed");
  }
}

// Every instance runs it; a second deletion of the same account just fails and is skipped.
setInterval(() => void runPurge(), PURGE_INTERVAL_MS).unref();
setTimeout(() => void runPurge(), 60_000).unref();
