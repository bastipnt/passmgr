import {
  SESSION_ID_HEADER,
  SESSION_NONCE_HEADER,
  SESSION_SIGNATURE_HEADER,
  SESSION_TIMESTAMP_HEADER,
} from "@repo/crypto";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { getConnectionParamsSave, getHeaderSave } from "./util/general";

type Session = {
  sessionId?: string;
  timestamp?: string;
  signature?: string;
  nonce?: string;
} | null;

interface CreateInnerContextOptions extends Partial<CreateFastifyContextOptions> {
  session: Session | null;
}

async function createContextInner(opts?: CreateInnerContextOptions) {
  return {
    session: opts?.session,
  };
}

export async function createContext(opts: CreateFastifyContextOptions) {
  const { headers, query } = opts.req;

  // Regular calls authenticate via headers; SSE subscriptions (no custom
  // headers possible) via connectionParams. Never mix the two sources.
  const session: Session = getHeaderSave(headers, SESSION_ID_HEADER)
    ? {
        sessionId: getHeaderSave(headers, SESSION_ID_HEADER),
        timestamp: getHeaderSave(headers, SESSION_TIMESTAMP_HEADER),
        signature: getHeaderSave(headers, SESSION_SIGNATURE_HEADER),
        nonce: getHeaderSave(headers, SESSION_NONCE_HEADER),
      }
    : getConnectionParamsSave(query);

  const contextInner = await createContextInner({ session });

  return {
    ...contextInner,
    req: opts.req,
    res: opts.res,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
