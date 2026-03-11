import { SESSION_ID_HEADER } from "@repo/crypto";
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

export function getSessionIdSave(
  headers: FastifyRequest["headers"],
  query: FastifyRequest["query"],
): string | undefined {
  let sessionId = getHeaderSave(headers, SESSION_ID_HEADER);
  if (sessionId) return sessionId;

  const rawConnectionParams = (query as Record<string, string | undefined>)?.["connectionParams"];
  if (!rawConnectionParams) return;

  const connectionParams = JSON.parse(rawConnectionParams) as Record<"sessionId", string>;
  return connectionParams.sessionId;
}
