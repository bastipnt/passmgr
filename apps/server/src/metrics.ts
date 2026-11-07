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

// Domain counters. Labels are fixed strings from the code (stage / reason
// constants), never a user, vault, email or IP: those would leak identities
// into the metrics store and blow up the series count.

export type AuthFlow = "login" | "device_login" | "second_factor";

const authFailures = new Counter({
  name: "passmgr_auth_failures_total",
  help: "Denied login, device login and second factor steps by stage and reason",
  labelNames: ["flow", "stage", "reason"] as const,
  registers: [metricsRegistry],
});

export function recordAuthFailure(flow: AuthFlow, stage: string, reason: string) {
  authFailures.inc({ flow, stage, reason });
}

const recoveryAttempts = new Counter({
  name: "passmgr_recovery_attempts_total",
  help: 'Account recovery steps by stage and outcome ("ok" or the denial reason)',
  labelNames: ["stage", "outcome"] as const,
  registers: [metricsRegistry],
});

export function recordRecoveryAttempt(stage: string, outcome: string) {
  recoveryAttempts.inc({ stage, outcome });
}

const logins = new Counter({
  name: "passmgr_logins_total",
  help: "Completed logins (session created) by method and whether a second factor was checked",
  labelNames: ["method", "second_factor"] as const,
  registers: [metricsRegistry],
});

export function recordLogin(method: "password" | "device", secondFactor: boolean) {
  logins.inc({ method, second_factor: String(secondFactor) });
}

export type RateLimiter = "ip" | "login" | "email_code";

const rateLimited = new Counter({
  name: "passmgr_rate_limited_total",
  help: "Requests refused by a rate limit: per-IP request limit, per-account login throttle, email code resend cap",
  labelNames: ["limiter"] as const,
  registers: [metricsRegistry],
});

export function recordRateLimited(limiter: RateLimiter) {
  rateLimited.inc({ limiter });
}

export type EmailVerificationEvent =
  | "code_sent"
  | "code_send_failed"
  | "verified"
  | "code_invalid"
  | "code_expired";

const emailVerification = new Counter({
  name: "passmgr_email_verification_total",
  help: "Email verification codes sent / failed to send and verification results",
  labelNames: ["event"] as const,
  registers: [metricsRegistry],
});

export function recordEmailVerification(event: EmailVerificationEvent) {
  emailVerification.inc({ event });
}
