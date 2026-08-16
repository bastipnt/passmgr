import { describe, expect, it } from "vitest";
import { buildTestContext } from "../../test/setup/test-context";
import { appRouter } from "../router";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

describe("recordRouter — auth gating", () => {
  it("create rejects without auth headers", async () => {
    const caller = createCaller(buildTestContext(undefined));
    await expect(
      caller.record.create({
        recordId: crypto.randomUUID(),
        encryptedData: "ENC",
        encryptionNonce: "NONCE",
        cryptoVersion: 1,
        clientUpdatedAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
