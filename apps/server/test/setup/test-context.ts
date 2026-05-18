import type { Context } from "../../src/context";
import type { SignedSessionHeaders } from "./signed-request";

/**
 * Build a tRPC Context shaped like the one createContext() returns in production,
 * but with no Fastify req/res. The middleware only reads `ctx.session` and
 * (optionally) `ctx.req?.log`, both of which we control here.
 */
export function buildTestContext(session: Partial<SignedSessionHeaders> | undefined): Context {
  return {
    session: session as Context["session"],
    req: undefined as unknown as Context["req"],
    res: undefined as unknown as Context["res"],
  };
}
