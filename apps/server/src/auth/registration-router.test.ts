import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Redis so importing appRouter doesn't spawn a real connection attempt.
const { redisMock } = vi.hoisted(() => {
  const IoRedisMock = require("ioredis-mock") as typeof import("ioredis-mock");
  return { redisMock: new IoRedisMock() };
});
vi.mock("../redis", () => ({ redis: redisMock }));

vi.mock("@repo/crypto", () =>
  import("../../test/setup/crypto-mock").then((m) => m.cryptoMockFactory()),
);

import * as opaque from "@serenity-kit/opaque";
import { db, keysTable, usersTable } from "@repo/db";
import { eq } from "drizzle-orm";
import { hashEmail } from "@repo/crypto";
import { fromString, toBase64 } from "@repo/util";
import { createCallerFactory } from "../trpc";
import { appRouter } from "../router";
import { buildTestContext } from "../../test/setup/test-context";
import { truncateAll } from "../../test/setup/db-helpers";
import { buildUserKeys } from "../../test/setup/user-keys";

const createCaller = createCallerFactory(appRouter);

async function runRegistration(email: string, password: string) {
  const caller = createCaller(buildTestContext(undefined));

  const { clientRegistrationState, registrationRequest } = opaque.client.startRegistration({
    password,
  });
  const { registrationResponse } = await caller.register.startRegistration({
    email,
    registrationRequest,
  });
  const { registrationRecord } = opaque.client.finishRegistration({
    clientRegistrationState,
    registrationResponse,
    password,
  });

  const { recoveryKey: _recoveryKey, ...userKeys } = await buildUserKeys(password);

  await caller.register.finishRegistration({
    email,
    registrationRecord,
    userKeys,
  });
}

beforeAll(async () => {
  await opaque.ready;
});

beforeEach(async () => {
  await truncateAll();
});

describe("startRegistration", () => {
  it("returns a non-empty registrationResponse", async () => {
    const caller = createCaller(buildTestContext(undefined));
    const password = "pw";
    const { registrationRequest } = opaque.client.startRegistration({ password });
    const out = await caller.register.startRegistration({
      email: "alice@example.com",
      registrationRequest,
    });
    expect(typeof out.registrationResponse).toBe("string");
    expect(out.registrationResponse.length).toBeGreaterThan(0);
  });
});

describe("finishRegistration — persistence", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("inserts a users row with all encrypted-email columns populated", async () => {
    await runRegistration(email, password);

    const users = await db.select().from(usersTable);
    expect(users).toHaveLength(1);

    const [user] = users;
    expect(user!.encryptedEmail).toBeTruthy();
    expect(user!.emailNonce).toBeTruthy();
    expect(user!.emailEncryptionKeySalt).toBeTruthy();
    expect(user!.emailHash).toBeTruthy();
    expect(user!.registrationRecord).toBeTruthy();
  });

  it("never stores the raw email in any column", async () => {
    await runRegistration(email, password);
    const [user] = await db.select().from(usersTable);
    const serialized = JSON.stringify(user);
    expect(serialized.includes(email)).toBe(false);
  });

  it("uses the keyed email hash (matches @repo/crypto hashEmail)", async () => {
    await runRegistration(email, password);
    const [user] = await db.select().from(usersTable);
    const serverKey = fromString(process.env.OPAQUE_SERVER_SETUP!);
    const expected = toBase64(await hashEmail(serverKey, email));
    expect(user!.emailHash).toBe(expected);
  });

  it("inserts a keys row with all 6 required key-material columns", async () => {
    await runRegistration(email, password);
    const [user] = await db.select().from(usersTable);
    const keys = await db.select().from(keysTable).where(eq(keysTable.userId, user!.userId));
    expect(keys).toHaveLength(1);
    const [k] = keys;
    expect(k!.passwordKekSalt).toBeTruthy();
    expect(k!.encryptedVaultKey).toBeTruthy();
    expect(k!.vaultKeyEncryptionNonce).toBeTruthy();
    expect(k!.recoveryKekSalt).toBeTruthy();
    expect(k!.encryptedVaultKeyRecovery).toBeTruthy();
    expect(k!.vaultKeyEncryptionNonceRecovery).toBeTruthy();
    expect(k!.passwordKekParams).toMatchObject({
      t: expect.any(Number),
      m: expect.any(Number),
      p: expect.any(Number),
    });
  });
});

describe("finishRegistration — duplicate email", () => {
  it("does not create a second user row (onConflictDoNothing on emailHash)", async () => {
    const email = "dupe@example.com";
    await runRegistration(email, "first-password");

    // Second registration with same email should be a no-op at the users-table layer
    // (it currently *does* create an orphan keys row — TODO: flag for later cleanup).
    await runRegistration(email, "different-password").catch(() => undefined);

    const users = await db.select().from(usersTable);
    expect(users).toHaveLength(1);
  });
});

describe("REGISTRATION_DISABLED gate", () => {
  it("rejects startRegistration when REGISTRATION_DISABLED=true", async () => {
    process.env.REGISTRATION_DISABLED = "true";
    try {
      const caller = createCaller(buildTestContext(undefined));
      const { registrationRequest } = opaque.client.startRegistration({ password: "x" });
      await expect(
        caller.register.startRegistration({ email: "x@y.zz", registrationRequest }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      delete process.env.REGISTRATION_DISABLED;
    }
  });
});
