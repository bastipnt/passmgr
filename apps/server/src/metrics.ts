import { Counter, collectDefaultMetrics, Histogram, Registry } from "@prometheus-io/client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: "passmgr_" });

// Labelled by procedure path only: unknown paths never reach a middleware, so
// the label set stays bounded by the router.
const trpcRequests = new Counter({
  name: "passmgr_trpc_requests_total",
  help: "tRPC calls by procedure, type and result code",
  labelNames: ["path", "type", "code"] as const,
  registers: [metricsRegistry],
});

const trpcDuration = new Histogram({
  name: "passmgr_trpc_request_duration_seconds",
  help: "tRPC call duration by procedure and type",
  labelNames: ["path", "type"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export function recordTrpcCall(path: string, type: string, code: string, durationMs: number) {
  trpcRequests.inc({ path, type, code });
  trpcDuration.observe({ path, type }, durationMs / 1000);
}
