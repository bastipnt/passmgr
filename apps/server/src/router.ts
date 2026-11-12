import { appConfigRouter } from "./app-config-router";
import { loginRouter } from "./auth/login-router";
import { recoveryRouter } from "./auth/recovery-router";
import { registrationRouter } from "./auth/registration-router";
import { sessionRouter } from "./auth/session-router";
import { clientErrorRouter } from "./client-error-router";
import { recordRouter } from "./record/router";
import { router } from "./trpc";
import { activityRouter } from "./user/activity-router";
import { userRouter } from "./user/router";
import { vaultRouter } from "./vault/router";

export const appRouter = router({
  appConfig: appConfigRouter,
  clientError: clientErrorRouter,
  user: userRouter,
  record: recordRouter,
  vault: vaultRouter,
  login: loginRouter,
  session: sessionRouter,
  activity: activityRouter,
  register: registrationRouter,
  recovery: recoveryRouter,
});

export type AppRouter = typeof appRouter;
