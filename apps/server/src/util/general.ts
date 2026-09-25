import { TRPCError } from "@trpc/server";
import type { FastifyRequest } from "fastify";

export function getHeaderSave(
  headers: FastifyRequest["headers"],
  name: string,
): string | undefined {
  const extractedHeaders = headers[name];

  if (Array.isArray(extractedHeaders))
    throw new TRPCError({ message: "wrong header format", code: "BAD_REQUEST" });

  return extractedHeaders;
}

export type SubscriptionAuthParams = {
  sessionId?: string;
  timestamp?: string;
  nonce?: string;
  signature?: string;
};

/**
 * SSE subscriptions can't set headers, so their auth values arrive as tRPC
 * `connectionParams` in the query string. Malformed input yields `{}` (the
 * auth middleware then rejects the request); non-string fields are dropped.
 */
export function getConnectionParamsSave(query: FastifyRequest["query"]): SubscriptionAuthParams {
  const raw = (query as Record<string, string | undefined> | undefined)?.["connectionParams"];
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};

  const params: SubscriptionAuthParams = {};
  for (const key of ["sessionId", "timestamp", "nonce", "signature"] as const) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === "string") params[key] = value;
  }
  return params;
}
