import { appConfigOutputSchema } from "@repo/schema";
import { publicProcedure, router } from "./trpc";

export const appConfigRouter = router({
  getConfig: publicProcedure.output(appConfigOutputSchema).query(() => {
    return {
      registrationEnabled: process.env.REGISTRATION_DISABLED !== "true",
    };
  }),
});
