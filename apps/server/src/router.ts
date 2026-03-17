import { appConfigRouter } from "./appConfigRouter";
import { loginRouter } from "./auth/loginRouter";
import { registrationRouter } from "./auth/registrationRouter";
import { entryRouter } from "./entry/router";
import { router } from "./trpc";
import { userRouter } from "./user/router";

export const appRouter = router({
  appConfig: appConfigRouter,
  user: userRouter,
  entry: entryRouter,
  login: loginRouter,
  register: registrationRouter,
});

export type AppRouter = typeof appRouter;
