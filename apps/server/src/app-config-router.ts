import { appConfigOutputSchema } from "@repo/schema";
import { loggedProcedure } from "./logger";
import { router } from "./trpc";

export const appConfigRouter = router({
  getConfig: loggedProcedure.output(appConfigOutputSchema).query(() => {
    return {
      registrationEnabled: process.env.REGISTRATION_DISABLED !== "true",
    };
  }),
});
