import { initTRPC } from "@trpc/server";
import type { Context } from "./context";
import { SoleOwnerCause } from "./user/sole-owner";

export const INTERNAL_ERROR_MESSAGE = "Internal server error";

const t = initTRPC.context<Context>().create({
  sse: {
    // Mobile NATs drop a silent stream without a FIN: pings keep it alive, the client recreates it
    // once they stop (docs/architecture/vaults-and-sync.md, Live updates).
    ping: { enabled: true, intervalMs: 15_000 },
    client: { reconnectAfterInactivityMs: 45_000 },
  },
  errorFormatter({ shape, error }) {
    // An unexpected error's message is the driver's: for a failed query, the SQL and its params.
    if (error.code === "INTERNAL_SERVER_ERROR") {
      return {
        ...shape,
        message: INTERNAL_ERROR_MESSAGE,
        data: { ...shape.data, stack: undefined },
      };
    }
    // `user.deleteAccount`: the shared vaults to hand over or delete first.
    const vaultIds = error.cause instanceof SoleOwnerCause ? error.cause.vaultIds : undefined;
    return vaultIds ? { ...shape, data: { ...shape.data, vaultIds } } : shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
