import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import fastify from "fastify";
import { serverEnv } from "./env";
import "./opaque";
import rateLimit from "@fastify/rate-limit";
import fastifyRedis from "@fastify/redis";
import { db } from "@repo/db";
import { MAX_REQUEST_BYTES } from "@repo/schema";
import { sql } from "drizzle-orm";
import { registerActiveUsersGauge } from "./active-users";
import { registerHealthRoutes } from "./health";
import { logRedact, logSerializers } from "./log-options";
import { metricsRegistry, recordRateLimited } from "./metrics";
import { redis } from "./redis";
import { createTrpcOptions } from "./trpc-options";
import { purgeExpiredAccountEvents } from "./user/account-events";
import { purgeUnverifiedAccounts } from "./user/email-verification";
import { purgeClosedKeySets } from "./user/purge-key-sets";
import { allowedOrigins } from "./util/allowed-origins";

const isDev = !serverEnv.production;

const trustProxy = serverEnv.TRUST_PROXY || false;

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

if (serverEnv.production && !trustProxy) {
  // Behind a proxy, every client would then share the proxy's rate-limit bucket.
  server.log.warn(
    { hint: "set TRUST_PROXY to the proxies' IPs/CIDRs" },
    "config.trust_proxy_unset",
  );
}

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
});

/** Ops routes only, on `OPS_PORT`: the public listener has no /health or /metrics. */
export const opsServer = fastify({ loggerInstance: server.log.child({ listener: "ops" }) });
server.addHook("onClose", async () => {
  await opsServer.close();
});

registerHealthRoutes(opsServer, {
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
  prefix: serverEnv.PREFIX,
  trpcOptions: createTrpcOptions(server.log),
});

const PURGE_INTERVAL_MS = 60 * 60_000;

async function runPurge() {
  const [accounts, keySets, events] = await Promise.allSettled([
    purgeUnverifiedAccounts({
      onError: (err) => server.log.warn({ err }, "auth.unverified.purge_account_failed"),
    }),
    purgeClosedKeySets(),
    purgeExpiredAccountEvents(),
  ]);
  if (accounts.status === "rejected") {
    server.log.error({ err: accounts.reason }, "auth.unverified.purge_failed");
  } else if (accounts.value.purged > 0 || accounts.value.failed > 0) {
    server.log.info(accounts.value, "auth.unverified.purged");
  }
  if (keySets.status === "rejected") {
    server.log.error({ err: keySets.reason }, "auth.keysets.purge_failed");
  } else if (keySets.value > 0) {
    server.log.info({ purged: keySets.value }, "auth.keysets.purged");
  }
  if (events.status === "rejected") {
    server.log.error({ err: events.reason }, "account_event.purge_failed");
  } else if (events.value > 0) {
    server.log.info({ purged: events.value }, "account_event.purged");
  }
}

// Every instance runs it; a second deletion of the same account or key set just fails or finds nothing.
setInterval(() => void runPurge(), PURGE_INTERVAL_MS).unref();
setTimeout(() => void runPurge(), 60_000).unref();
