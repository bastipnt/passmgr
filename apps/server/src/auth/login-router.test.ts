import { beforeEach, describe, expect, it } from "vitest";

import { createCallerFactory } from "../trpc";
import { appRouter } from "../router";
import { redis } from "../redis";
import { buildTestContext } from "../../test/setup/test-context";
import { truncateAll } from "../../test/setup/db-helpers";
import { buildUserKeys } from "../../test/setup/user-keys";
import { clientStartLogin, clientStartRegistration } from "../../test/setup/opaque-client";

const createCaller = createCallerFactory(appRouter);

async function register(email: string, password: string) {
  const caller = createCaller(buildTestContext(undefined));
  const started = await clientStartRegistration(password);
  const { registrationResponse } = await caller.register.startRegistration({
    email,
    registrationRequest: started.registrationRequest,
  });
  const { registrationRecord } = await started.finish(registrationResponse, email);
  const { recoveryKey: _r, ...userKeys } = await buildUserKeys(password);
  await caller.register.finishRegistration({ email, registrationRecord, userKeys });
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("loginRouter — edge cases", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("startLogin → UNAUTHORIZED when user does not exist", async () => {
    const caller = createCaller(buildTestContext(undefined));
    const { startLoginRequest } = await clientStartLogin(password);
    await expect(
      caller.login.startLogin({ email: "nobody@example.com", startLoginRequest }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("finishLogin → UNAUTHORIZED with the wrong password", async () => {
    await register(email, password);
    const caller = createCaller(buildTestContext(undefined));
    const started = await clientStartLogin("WRONG-PASSWORD");
    const { loginResponse } = await caller.login.startLogin({
      email,
      startLoginRequest: started.startLoginRequest,
    });
    const result = await started.finish(loginResponse, email);
    // OPAQUE may reject client-side (null return) or server-side — both are correct.
    if (!result) return;
    await expect(
      caller.login.finishLogin({
        email,
        finishLoginRequest: result.finishLoginRequest,
        authSalt: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("startLogin → BAD_REQUEST on malformed input (Zod)", async () => {
    const caller = createCaller(buildTestContext(undefined));
    await expect(
      // @ts-expect-error — deliberately bypassing input type to test runtime validation.
      caller.login.startLogin({ email: "not-an-email", startLoginRequest: 42 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
