import { appConfigRouter } from "./app-config-router";
import { loginRouter } from "./auth/login-router";
import { recoveryRouter } from "./auth/recovery-router";
import { registrationRouter } from "./auth/registration-router";
import { recordRouter } from "./record/router";
import { router } from "./trpc";
import { userRouter } from "./user/router";

export const appRouter = router({
  appConfig: appConfigRouter,
  user: userRouter,
  record: recordRouter,
  login: loginRouter,
  register: registrationRouter,
  recovery: recoveryRouter,
});

export type AppRouter = typeof appRouter;
