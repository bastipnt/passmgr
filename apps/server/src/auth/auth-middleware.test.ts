import { beforeEach, describe, expect, it, vi } from "vitest";

const { redisMock } = vi.hoisted(() => {
  // require() avoids ESM/TLA timing issues inside the hoisted factory
  const IoRedisMock = require("ioredis-mock") as typeof import("ioredis-mock");
  return { redisMock: new IoRedisMock() };
});

vi.mock("../redis", () => ({ redis: redisMock }));

import z from "zod";
import fc from "fast-check";
import { TRPCError } from "@trpc/server";
import { genKey } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import { protectedProcedure } from "./auth-middleware";
import { createCallerFactory, router } from "../trpc";
import { buildTestContext } from "../../test/setup/test-context";
import { deriveAuthKey, signRequest } from "../../test/setup/signed-request";

const testRouter = router({
  echo: protectedProcedure
    .input(z.object({ msg: z.string() }))
    .mutation(({ input, ctx }) => ({ ok: true, userId: ctx.userId, msg: input.msg })),
});

const createCaller = createCallerFactory(testRouter);

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_KEY = "deterministic-session-key";

async function seedSession(userId = "user-A"): Promise<{ authKey: Uint8Array }> {
  const authSalt = genKey();
  const authKey = await deriveAuthKey(SESSION_KEY, authSalt);
  await redisMock.set(
    `session:${SESSION_ID}`,
    JSON.stringify({ userId, rawAuthKey: toBase64(authKey) }),
    "EX",
    3600,
  );
  return { authKey };
}

beforeEach(async () => {
  await redisMock.flushall();
});

describe("protectedProcedure — happy path", () => {
  it("accepts a valid signed request", async () => {
    const { authKey } = await seedSession();
    const headers = await signRequest({
      authKey,
      sessionId: SESSION_ID,
      type: "mutation",
      path: "echo",
      input: { msg: "hi" },
    });
    const caller = createCaller(buildTestContext(headers));
    const out = await caller.echo({ msg: "hi" });
    expect(out).toEqual({ ok: true, userId: "user-A", msg: "hi" });
  });
});

describe("protectedProcedure — rejections", () => {
  async function expectUnauthorized(call: () => Promise<unknown>) {
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  }

  it("rejects when ALL headers are missing", async () => {
    const caller = createCaller(buildTestContext(undefined));
    await expectUnauthorized(() => caller.echo({ msg: "x" }));
  });

  it.each([
    ["sessionId", { timestamp: "1", signature: "x", nonce: "n" }],
    ["timestamp", { sessionId: SESSION_ID, signature: "x", nonce: "n" }],
    ["signature", { sessionId: SESSION_ID, timestamp: "1", nonce: "n" }],
    ["nonce", { sessionId: SESSION_ID, timestamp: "1", signature: "x" }],
  ])("rejects when %s header is missing", async (_name, headers) => {
    const caller = createCaller(buildTestContext(headers));
    await expectUnauthorized(() => caller.echo({ msg: "x" }));
  });

  it.each([
    ["+6 minutes", 6 * 60_000 + 1],
    ["-6 minutes", -(6 * 60_000 + 1)],
  ])("rejects when timestamp is %s out of window", async (_name, offset) => {
    const { authKey } = await seedSession();
    const headers = await signRequest({
      authKey,
      sessionId: SESSION_ID,
      type: "mutation",
      path: "echo",
      input: { msg: "x" },
      timestamp: Date.now() + offset,
    });
    const caller = createCaller(buildTestContext(headers));
    await expectUnauthorized(() => caller.echo({ msg: "x" }));
  });

  it("rejects when sessionId is unknown to Redis", async () => {
    const { authKey } = await seedSession();
    const headers = await signRequest({
      authKey,
      sessionId: "00000000-0000-0000-0000-000000000000",
      type: "mutation",
      path: "echo",
      input: { msg: "x" },
    });
    const caller = createCaller(buildTestContext(headers));
    await expectUnauthorized(() => caller.echo({ msg: "x" }));
  });

  it("rejects when the signature was computed for a different path", async () => {
    const { authKey } = await seedSession();
    const headers = await signRequest({
      authKey,
      sessionId: SESSION_ID,
      type: "mutation",
      path: "different.path",
      input: { msg: "x" },
    });
    const caller = createCaller(buildTestContext(headers));
    await expectUnauthorized(() => caller.echo({ msg: "x" }));
  });

  it("rejects when the signature was computed for a different type", async () => {
    const { authKey } = await seedSession();
    const headers = await signRequest({
      authKey,
      sessionId: SESSION_ID,
      type: "query",
      path: "echo",
      input: { msg: "x" },
    });
    const caller = createCaller(buildTestContext(headers));
    await expectUnauthorized(() => caller.echo({ msg: "x" }));
  });

  it("rejects when the signature was computed for a different input body", async () => {
    const { authKey } = await seedSession();
    const headers = await signRequest({
      authKey,
      sessionId: SESSION_ID,
      type: "mutation",
      path: "echo",
      input: { msg: "DIFFERENT" },
    });
    const caller = createCaller(buildTestContext(headers));
    await expectUnauthorized(() => caller.echo({ msg: "x" }));
  });

  it("rejects when a single byte in the signature is flipped", async () => {
    const { authKey } = await seedSession();
    const headers = await signRequest({
      authKey,
      sessionId: SESSION_ID,
      type: "mutation",
      path: "echo",
      input: { msg: "x" },
    });
    // Flip first byte of the base64-decoded signature.
    const sigBytes = Buffer.from(headers.signature, "base64");
    sigBytes[0] = sigBytes[0]! ^ 0x01;
    const tampered = { ...headers, signature: sigBytes.toString("base64") };
    const caller = createCaller(buildTestContext(tampered));
    await expectUnauthorized(() => caller.echo({ msg: "x" }));
  });

  it("rejects when the stored rawAuthKey does not match the signer's key", async () => {
    const wrongAuthKey = genKey();
    await redisMock.set(
      `session:${SESSION_ID}`,
      JSON.stringify({ userId: "u", rawAuthKey: toBase64(wrongAuthKey) }),
      "EX",
      3600,
    );
    const signerAuthKey = genKey();
    const headers = await signRequest({
      authKey: signerAuthKey,
      sessionId: SESSION_ID,
      type: "mutation",
      path: "echo",
      input: { msg: "x" },
    });
    const caller = createCaller(buildTestContext(headers));
    await expectUnauthorized(() => caller.echo({ msg: "x" }));
  });

  it("throws TRPCError (not a generic Error)", async () => {
    const caller = createCaller(buildTestContext(undefined));
    await expect(caller.echo({ msg: "x" })).rejects.toBeInstanceOf(TRPCError);
  });
});

describe("protectedProcedure — replay protection (nonce)", () => {
  it("rejects a second call that reuses the same nonce within the active window", async () => {
    const { authKey } = await seedSession();
    const headers = await signRequest({
      authKey,
      sessionId: SESSION_ID,
      type: "mutation",
      path: "echo",
      input: { msg: "hi" },
    });

    // First call must succeed and claim the nonce.
    const first = createCaller(buildTestContext(headers));
    await expect(first.echo({ msg: "hi" })).resolves.toMatchObject({ ok: true });

    // Replay verbatim — same nonce — must fail.
    const second = createCaller(buildTestContext(headers));
    await expect(second.echo({ msg: "hi" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("a fresh nonce on every call keeps the same session working", async () => {
    const { authKey } = await seedSession();
    for (let i = 0; i < 3; i++) {
      const headers = await signRequest({
        authKey,
        sessionId: SESSION_ID,
        type: "mutation",
        path: "echo",
        input: { msg: `n${i}` },
      });
      const caller = createCaller(buildTestContext(headers));
      await expect(caller.echo({ msg: `n${i}` })).resolves.toMatchObject({ ok: true });
    }
  });
});

describe("protectedProcedure — non-malleability (fast-check)", () => {
  it("any single-character substitution in any header breaks verification", async () => {
    const { authKey } = await seedSession();

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("sessionId", "timestamp", "signature"),
        fc.integer({ min: 0, max: 1_000_000 }),
        async (field, seed) => {
          const headers = await signRequest({
            authKey,
            sessionId: SESSION_ID,
            type: "mutation",
            path: "echo",
            input: { msg: "ping" },
          });
          const key = field as keyof typeof headers;
          const orig = headers[key]!;
          if (orig.length === 0) return;
          const pos = seed % orig.length;
          // pick a replacement char guaranteed to differ from the original
          const replacement = orig[pos] === "A" ? "B" : "A";
          const mutatedStr = orig.slice(0, pos) + replacement + orig.slice(pos + 1);
          const mutated = { ...headers, [key]: mutatedStr };

          const caller = createCaller(buildTestContext(mutated));
          await expect(caller.echo({ msg: "ping" })).rejects.toMatchObject({
            code: "UNAUTHORIZED",
          });
        },
      ),
      { numRuns: 25 },
    );
  });

  it("any single-bit flip in the request body breaks verification", async () => {
    const { authKey } = await seedSession();
    const headers = await signRequest({
      authKey,
      sessionId: SESSION_ID,
      type: "mutation",
      path: "echo",
      input: { msg: "ping" },
    });

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s !== "ping"),
        async (altMsg) => {
          const caller = createCaller(buildTestContext(headers));
          await expect(caller.echo({ msg: altMsg })).rejects.toMatchObject({
            code: "UNAUTHORIZED",
          });
        },
      ),
      { numRuns: 20 },
    );
  });
});
