import { listAccountEventsInputSchema, listAccountEventsOutputSchema } from "@repo/schema";
import { protectedProcedure } from "../auth/auth-middleware";
import { router } from "../trpc";
import { listAccountEvents } from "./account-events";

export const activityRouter = router({
  list: protectedProcedure
    .input(listAccountEventsInputSchema)
    .output(listAccountEventsOutputSchema)
    .query(async ({ ctx, input }) => await listAccountEvents(ctx.userId, input.before)),
});
