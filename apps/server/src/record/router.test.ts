import { describe, expect, it } from "vitest";
import { buildTestContext } from "../../test/setup/test-context";
import { appRouter } from "../router";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(appRouter);

describe("recordRouter — auth gating", () => {
  it("push rejects without auth headers", async () => {
    const caller = createCaller(buildTestContext(undefined));
    await expect(
      caller.record.push({
        changes: [
          {
            op: "put",
            clientChangeId: crypto.randomUUID(),
            recordId: crypto.randomUUID(),
            vaultId: crypto.randomUUID(),
            baseVersion: 0,
            encryptedData: "ENC",
            encryptionNonce: "NONCE",
            cryptoVersion: 1,
            keyVersion: 1,
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
