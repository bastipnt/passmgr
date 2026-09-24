import { db, usersTable } from "@repo/db";
import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../../test/setup/db-helpers";
import { clientStartRegistration } from "../../test/setup/opaque-client";
import { buildTestContext } from "../../test/setup/test-context";
import { buildUserKeys } from "../../test/setup/user-keys";
import { redis } from "../redis";
import { appRouter } from "../router";
import { createCallerFactory } from "../trpc";
import { createInvite, getInvite } from "../util/redis-utils";

const createCaller = createCallerFactory(appRouter);

async function runRegistration(email: string, password: string, invite?: string) {
  const caller = createCaller(buildTestContext(undefined));
  const started = await clientStartRegistration(password);
  const { registrationResponse } = await caller.register.startRegistration({
    email,
    registrationRequest: started.registrationRequest,
    invite,
  });
  const { registrationRecord } = await started.finish(registrationResponse, email);
  const { recoveryKey: _r, ...userKeys } = await buildUserKeys(password);
  await caller.register.finishRegistration({ email, registrationRecord, userKeys, invite });
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

describe("registrationRouter — invites while REGISTRATION_DISABLED=true", () => {
  beforeEach(() => {
    process.env.REGISTRATION_DISABLED = "true";
    return () => {
      delete process.env.REGISTRATION_DISABLED;
    };
  });

  it("valid invite registers the user and is consumed", async () => {
    const invite = await createInvite();
    await runRegistration("invited@example.com", "pw-pw-pw-pw", invite);

    expect(await db.select().from(usersTable)).toHaveLength(1);
    expect(await getInvite(invite)).toBeUndefined();
  });

  it("invite is single use", async () => {
    const invite = await createInvite();
    await runRegistration("first@example.com", "pw-pw-pw-pw", invite);

    await expect(
      runRegistration("second@example.com", "pw-pw-pw-pw", invite),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(usersTable)).toHaveLength(1);
  });

  it("unknown invite → FORBIDDEN", async () => {
    await expect(runRegistration("x@example.com", "pw-pw-pw-pw", "nope")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("email-bound invite rejects a different email", async () => {
    const invite = await createInvite({ email: "bob@example.com" });

    await expect(runRegistration("eve@example.com", "pw-pw-pw-pw", invite)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await getInvite(invite)).toEqual({ email: "bob@example.com" });
  });

  it("email-bound invite accepts its email case-insensitively", async () => {
    const invite = await createInvite({ email: "bob@example.com" });
    await runRegistration("Bob@Example.com", "pw-pw-pw-pw", invite);

    expect(await db.select().from(usersTable)).toHaveLength(1);
  });

  it("stores only a hash of the code", async () => {
    const invite = await createInvite();
    const keys = await redis.keys("invite:*");

    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(invite);
  });
});
