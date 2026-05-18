import { describe, expect, it } from "vitest";

import { createCallerFactory } from "../trpc";
import { appRouter } from "../router";
import { buildTestContext } from "../../test/setup/test-context";

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
