import { SESSION_SIGNATURE_HEADER, SESSION_TIMESTAMP_HEADER } from "@repo/crypto";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { getHeaderSave, getSessionIdSave } from "./util/general";

type Session = { sessionId?: string; timestamp?: string; signature?: string; salt?: string } | null;

interface CreateInnerContextOptions extends Partial<CreateFastifyContextOptions> {
  session: Session | null;
}

export async function createContextInner(opts?: CreateInnerContextOptions) {
  return {
    session: opts?.session,
  };
}

export async function createContext(opts: CreateFastifyContextOptions) {
  const sessionId = getSessionIdSave(opts.req.headers, opts.req.query);

  console.log({ sessionId }, opts.req.query);

  const timestamp = getHeaderSave(opts.req.headers, SESSION_TIMESTAMP_HEADER);
  const signature = getHeaderSave(opts.req.headers, SESSION_SIGNATURE_HEADER);

  const session: Session = { sessionId, timestamp, signature };

  const contextInner = await createContextInner({ session });

  return {
    ...contextInner,
    req: opts.req,
    res: opts.res,
  };
}

export type Context = Awaited<ReturnType<typeof createContextInner>>;
