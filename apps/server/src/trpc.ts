import { initTRPC } from "@trpc/server";
import type { Context } from "./context";
import { SoleOwnerCause } from "./user/sole-owner";

const t = initTRPC.context<Context>().create({
  sse: {
    // `record.onRecordChange` is silent between record changes. Without pings a
    // mobile carrier/NAT drops the connection with no FIN and neither side
    // notices; `reconnectAfterInactivityMs` makes the client recreate the stream
    // once the pings stop arriving.
    ping: { enabled: true, intervalMs: 15_000 },
    client: { reconnectAfterInactivityMs: 45_000 },
  },
  errorFormatter({ shape, error }) {
    // `user.deleteAccount`: the shared vaults to hand over or delete first.
    const vaultIds = error.cause instanceof SoleOwnerCause ? error.cause.vaultIds : undefined;
    return vaultIds ? { ...shape, data: { ...shape.data, vaultIds } } : shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
