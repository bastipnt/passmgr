import {
  SESSION_ID_HEADER,
  SESSION_SIGNATURE_HEADER,
  SESSION_TIMESTAMP_HEADER,
} from "@repo/crypto";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { getHeaderSave } from "@util/general";

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
  const sessionId = getHeaderSave(opts.req.headers, SESSION_ID_HEADER);
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
