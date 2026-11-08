import { clientErrorInputSchema } from "@repo/schema";
import { loggedProcedure } from "./logger";
import { recordClientError } from "./metrics";
import { router } from "./trpc";

export const clientErrorRouter = router({
  /** Public: a crash can happen before the unlock. Counts only; the input holds no free text. */
  report: loggedProcedure.input(clientErrorInputSchema).mutation(({ input }) => {
    recordClientError(input);
  }),
});
