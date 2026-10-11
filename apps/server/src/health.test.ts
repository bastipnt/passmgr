import { Registry } from "@prometheus-io/client";
import { db } from "@repo/db";
import { sql } from "drizzle-orm";
import fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { type HealthCheck, registerHealthRoutes, runHealthChecks } from "./health";
import { metricsRegistry, recordTrpcCall } from "./metrics";
import { redis } from "./redis";

function buildApp(checks: Record<string, HealthCheck>, registry = new Registry()) {
  const app = fastify();
  registerHealthRoutes(app, { checks, registry });
  return app;
}

afterAll(() => {
  redis.disconnect();
});

describe("runHealthChecks", () => {
  it("fails a check that doesn't answer in time", async () => {
    const health = await runHealthChecks({ slow: () => new Promise(() => {}) }, 10);
    expect(health).toEqual({
      ok: false,
      checks: { slow: { status: "error", error: "timed out after 10 ms" } },
    });
  });
});

describe("GET /health", () => {
  it("answers 200 when Postgres and Redis respond", async () => {
    const app = buildApp({
      db: () => db.execute(sql`select 1`),
      redis: () => redis.ping(),
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json()).toEqual({ status: "ok", checks: { db: "ok", redis: "ok" } });
  });

  it("answers 503 naming the failed dependency, without its error", async () => {
    const app = buildApp({
      db: async () => {},
      redis: () => Promise.reject(new Error("ECONNREFUSED 10.0.0.5:6379")),
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "error", checks: { db: "ok", redis: "error" } });
    expect(res.body).not.toContain("ECONNREFUSED");
  });
});

describe("GET /metrics", () => {
  it("exposes dependency status and tRPC call metrics in Prometheus format", async () => {
    recordTrpcCall("login.startLogin", "mutation", "OK", 42);
    const app = buildApp(
      { db: async () => {}, redis: () => Promise.reject(new Error("down")) },
      metricsRegistry,
    );
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain('passmgr_dependency_up{dependency="db"} 1');
    expect(res.body).toContain('passmgr_dependency_up{dependency="redis"} 0');
    expect(res.body).toContain(
      'passmgr_trpc_requests_total{path="login.startLogin",type="mutation",code="OK"} 1',
    );
    expect(res.body).toContain("passmgr_trpc_request_duration_seconds_bucket");
    expect(res.body).toContain("passmgr_process_resident_memory_bytes");
  });
});
