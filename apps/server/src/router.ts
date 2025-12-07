import { entryRouter } from "./entry/router";
import { router } from "./trpc";
import { userRouter } from "./user/router";

export const appRouter = router({
  user: userRouter,
  entry: entryRouter,
});

export type AppRouter = typeof appRouter;
