import { publicProcedure } from "./trpc";
import { router } from "./trpc";
import { appConfigOutputSchema } from "@repo/schema";

export const appConfigRouter = router({
  getConfig: publicProcedure.output(appConfigOutputSchema).query(() => {
    return {
      registrationEnabled: process.env.REGISTRATION_DISABLED !== "true",
    };
  }),
});
