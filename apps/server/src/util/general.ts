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
