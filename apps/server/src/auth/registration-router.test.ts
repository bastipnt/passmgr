import { beforeEach, describe, expect, it } from "vitest";

import { db, usersTable } from "@repo/db";
import { createCallerFactory } from "../trpc";
import { appRouter } from "../router";
import { redis } from "../redis";
import { buildTestContext } from "../../test/setup/test-context";
import { truncateAll } from "../../test/setup/db-helpers";
import { buildUserKeys } from "../../test/setup/user-keys";
import { clientStartRegistration } from "../../test/setup/opaque-client";

const createCaller = createCallerFactory(appRouter);

async function runRegistration(email: string, password: string) {
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

describe("registrationRouter — edge cases", () => {
  it("startRegistration → FORBIDDEN when REGISTRATION_DISABLED=true", async () => {
    process.env.REGISTRATION_DISABLED = "true";
    try {
      const caller = createCaller(buildTestContext(undefined));
      const started = await clientStartRegistration("x");
      await expect(
        caller.register.startRegistration({
          email: "x@y.zz",
          registrationRequest: started.registrationRequest,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      delete process.env.REGISTRATION_DISABLED;
    }
  });

  it("duplicate-email registration is a no-op at the users table (onConflictDoNothing)", async () => {
    const email = "dupe@example.com";
    await runRegistration(email, "first-password");
    await runRegistration(email, "different-password").catch(() => undefined);

    const users = await db.select().from(usersTable);
    expect(users).toHaveLength(1);
  });

  it("finishRegistration → BAD_REQUEST on malformed userKeys (Zod)", async () => {
    const caller = createCaller(buildTestContext(undefined));
    await expect(
      caller.register.finishRegistration({
        email: "alice@example.com",
        registrationRecord: "AAAA",
        // @ts-expect-error — passing a partial userKeys to trigger schema rejection.
        userKeys: { passwordKekSalt: "too-short" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
