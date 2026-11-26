import { nonCanonicalBase64 } from "@repo/schema/testing/non-canonical";
import { fromBase64, toBase64 } from "@repo/util";
import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../../test/setup/db-helpers";
import { clientStartRegistration } from "../../test/setup/opaque-client";
import { buildTestContext } from "../../test/setup/test-context";
import { buildUserKeys } from "../../test/setup/user-keys";
import { redis } from "../redis";
import { appRouter } from "../router";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

// P-256 registration requests (33 bytes) and records (129) use every bit of their last digit;
// one byte short, the last digit has unused bits a client could set.
function shortened(b64: string): string {
  return toBase64(fromBase64(b64).slice(0, -1));
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("recoveryRouter — input encoding", () => {
  const email = "alice@example.com";
  const password = "a brand new master password";

  it("startRecovery → BAD_REQUEST on a non-canonical registration request", async () => {
    const caller = createCaller(buildTestContext(undefined));
    const { registrationRequest } = await clientStartRegistration(password, email);
    const input = { email, recoveryAuthKey: toBase64(new Uint8Array(32)) };
    const canonical = shortened(registrationRequest);

    await expect(
      caller.recovery.startRecovery({
        ...input,
        registrationRequest: nonCanonicalBase64(canonical),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // The canonical spelling passes the input check and fails on the unknown account instead.
    await expect(
      caller.recovery.startRecovery({ ...input, registrationRequest: canonical }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("finishRecovery → BAD_REQUEST on a non-canonical registration record", async () => {
    const caller = createCaller(buildTestContext(undefined));
    const started = await clientStartRegistration(password, email);
    const { registrationResponse } = await caller.register.startRegistration({
      email,
      registrationRequest: started.registrationRequest,
    });
    const { registrationRecord } = await started.finish(registrationResponse);
    const { recoveryKey: _, ...userKeys } = await buildUserKeys(password);
    const input = { email, attemptId: crypto.randomUUID(), userKeys };
    const canonical = shortened(registrationRecord);

    await expect(
      caller.recovery.finishRecovery({
        ...input,
        registrationRecord: nonCanonicalBase64(canonical),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // The canonical spelling passes the input check and fails on the unknown attempt instead.
    await expect(
      caller.recovery.finishRecovery({ ...input, registrationRecord: canonical }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
