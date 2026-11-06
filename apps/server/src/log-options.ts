import { isIP } from "node:net";
import type { FastifyRequest } from "fastify";

const SECRET_KEYS = [
  "email",
  "startLoginRequest",
  "finishLoginRequest",
  "startRegistrationRequest",
  "registrationRecord",
  "recoveryKey",
  "recoveryAuthKey",
  "passwordKekSalt",
  "userKeys",
];

export const logRedact = {
  paths: [
    'req.headers["x-signature"]',
    'req.headers["x-session-id"]',
    "req.headers.authorization",
    "req.headers.cookie",
    // pino's `*.key` only matches one level down, so the top-level key is listed too.
    ...SECRET_KEYS.flatMap((key) => [key, `*.${key}`]),
  ],
  censor: "[REDACTED]",
};

/** Path without query string — for logging URLs that may carry secrets. */
export function stripQuery(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

/**
 * Client IP cut to its network (IPv4 /24, IPv6 /48): enough to spot an abusive
 * range, not enough to pin a user. Logs are shipped to Loki and kept for days.
 */
export function truncateIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const mapped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(mapped) === 4) return `${mapped.split(".").slice(0, 3).join(".")}.0/24`;
  if (isIP(mapped) === 6) {
    const [head = "", tail = ""] = mapped.split("::");
    const headGroups = head ? head.split(":") : [];
    const tailGroups = tail ? tail.split(":") : [];
    const groups = mapped.includes("::")
      ? [
          ...headGroups,
          ...Array(8 - headGroups.length - tailGroups.length).fill("0"),
          ...tailGroups,
        ]
      : headGroups;
    return `${groups.slice(0, 3).join(":")}::/48`;
  }
  return undefined;
}

export const logSerializers = {
  // Drop the query string: SSE subscriptions carry session id + signature
  // in `?connectionParams=…`, which must not end up in logs.
  req: (req: FastifyRequest) => ({
    method: req.method,
    url: stripQuery(req.url),
    host: req.host,
    remoteAddress: truncateIp(req.ip),
  }),
};
