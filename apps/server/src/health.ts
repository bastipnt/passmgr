import { Gauge, type Registry } from "@prometheus-io/client";
import type { FastifyInstance } from "fastify";

export type HealthCheck = () => Promise<unknown>;

export const HEALTH_CHECK_TIMEOUT_MS = 2_000;

type CheckResult = { status: "ok" } | { status: "error"; error: string };

function withTimeout(check: HealthCheck, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([check(), timeout]).finally(() => clearTimeout(timer));
}

export async function runHealthChecks(
  checks: Record<string, HealthCheck>,
  timeoutMs = HEALTH_CHECK_TIMEOUT_MS,
): Promise<{ ok: boolean; checks: Record<string, CheckResult> }> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]): Promise<[string, CheckResult]> => {
      try {
        await withTimeout(check, timeoutMs);
        return [name, { status: "ok" }];
      } catch (err) {
        return [name, { status: "error", error: err instanceof Error ? err.message : String(err) }];
      }
    }),
  );
  return {
    ok: entries.every(([, result]) => result.status === "ok"),
    checks: Object.fromEntries(entries),
  };
}

/**
 * `GET /health` (200 / 503 with each dependency's status; errors only go to the
 * log) and `GET /metrics` (Prometheus text). Both sit outside `PREFIX`, the only
 * path the public proxy forwards, so they stay internal.
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  { checks, registry }: { checks: Record<string, HealthCheck>; registry: Registry },
) {
  new Gauge({
    name: "passmgr_dependency_up",
    help: "1 when the dependency answered its health check at scrape time",
    labelNames: ["dependency"] as const,
    registers: [registry],
    async collect() {
      const health = await runHealthChecks(checks);
      for (const [dependency, result] of Object.entries(health.checks)) {
        this.set({ dependency }, result.status === "ok" ? 1 : 0);
      }
    },
  });

  const routeConfig = { config: { rateLimit: false }, logLevel: "warn" } as const;

  app.get("/health", routeConfig, async (req, reply) => {
    const health = await runHealthChecks(checks);
    if (!health.ok) req.log.warn({ checks: health.checks }, "health.failed");
    const statuses = Object.fromEntries(
      Object.entries(health.checks).map(([name, result]) => [name, result.status]),
    );
    return reply
      .code(health.ok ? 200 : 503)
      .header("cache-control", "no-store")
      .send({ status: health.ok ? "ok" : "error", checks: statuses });
  });

  app.get("/metrics", routeConfig, async (_req, reply) => {
    return reply
      .header("content-type", registry.contentType)
      .header("cache-control", "no-store")
      .send(await registry.metrics());
  });
}
