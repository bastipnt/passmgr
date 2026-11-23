import { Writable } from "node:stream";
import { unwrapVaultKey } from "@repo/crypto";
import { db } from "@repo/db";
import { toBase64 } from "@repo/util";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { sql } from "drizzle-orm";
import fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { loginUser, type PasswordLoginTRPCClient } from "../../../../packages/client/src/login";
import {
  type RegistrationTRPCClient,
  registerNewUser,
} from "../../../../packages/client/src/register";
import { unwrapAccountKeyWithPassword } from "../../../../packages/client/src/util/derive-password-kek";
import { logRedact, logSerializers } from "../../src/log-options";
import { redis } from "../../src/redis";
import { appRouter } from "../../src/router";
import {
  createCallerFactory,
  INTERNAL_ERROR_MESSAGE,
  publicProcedure,
  router,
} from "../../src/trpc";
import { createTrpcOptions } from "../../src/trpc-options";
import { truncateAll } from "../setup/db-helpers";
import { buildTestContext } from "../setup/test-context";

const createCaller = createCallerFactory(appRouter);

type CapturedCall = { path: string; input: unknown };

/** The client calls of a register + login: records every (path, input) it sends, then forwards. */
function captureClient(): {
  trpc: RegistrationTRPCClient & PasswordLoginTRPCClient;
  captured: CapturedCall[];
} {
  const captured: CapturedCall[] = [];
  const caller = createCaller(buildTestContext(undefined));

  function record<I, O>(path: string, call: (input: I) => Promise<O>) {
    return {
      mutate: async (input: I) => {
        captured.push({ path, input });
        return await call(input);
      },
    };
  }

  const trpc = {
    register: {
      startRegistration: record("register.startRegistration", caller.register.startRegistration),
      finishRegistration: record("register.finishRegistration", caller.register.finishRegistration),
    },
    login: {
      startLogin: record("login.startLogin", caller.login.startLogin),
      finishLogin: record("login.finishLogin", caller.login.finishLogin),
      verifySecondFactor: record("login.verifySecondFactor", caller.login.verifySecondFactor),
    },
  };

  return { trpc, captured };
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("no-secret-leak — real client code, real server (in-process)", () => {
  it("password, recoveryKey, accountKey and vault keys never appear in any tRPC input", async () => {
    const email = "alice@example.com";
    const password = "correct-horse-battery-staple-DO-NOT-LEAK-XYZ";

    const { trpc, captured } = captureClient();

    const recoveryKey = await registerNewUser(trpc, email, password);

    const unlock = await loginUser(trpc, async () => {}, email, password);

    expect(captured.length).toBeGreaterThan(0);

    // Recover the plaintext keys the way the client does after login, so the
    // captured traffic can be searched for them.
    const accountKey = await unwrapAccountKeyWithPassword(password, unlock.userPasswordKeys);
    const vaultKeys = unlock.vaultKeys.map((wrap) => unwrapVaultKey(accountKey, wrap));
    expect(vaultKeys).toHaveLength(1);

    const secrets: [label: string, bytes: Uint8Array][] = [
      ["recoveryKey", recoveryKey],
      ["accountKey", accountKey],
      ...vaultKeys.map((key, i): [string, Uint8Array] => [`vaultKey[${i}]`, key]),
    ];

    for (const call of captured) {
      const serialized = JSON.stringify(call.input);
      expect(serialized.includes(password), `password plaintext leaked in ${call.path}`).toBe(
        false,
      );
      for (const [label, bytes] of secrets) {
        const hex = Buffer.from(bytes).toString("hex");
        expect(serialized.includes(hex), `${label} (hex) leaked in ${call.path}`).toBe(false);
        expect(
          serialized.includes(toBase64(bytes)),
          `${label} (base64) leaked in ${call.path}`,
        ).toBe(false);
      }
    }
  });
});

describe("no-secret-leak — a failed query", () => {
  it("answers and logs it without the SQL or its params", async () => {
    const param = "query-param-DO-NOT-LEAK-XYZ";
    const failingRouter = router({
      failingQuery: publicProcedure.query(() => db.execute(sql`select ${param}::int`)),
    });

    const logLines: string[] = [];
    const app = fastify({
      logger: {
        redact: logRedact,
        serializers: logSerializers,
        stream: new Writable({
          write(chunk, _encoding, done) {
            logLines.push(String(chunk));
            done();
          },
        }),
      },
    });
    const trpcOptions = { ...createTrpcOptions(app.log), router: failingRouter };
    await app.register(fastifyTRPCPlugin, {
      trpcOptions: trpcOptions as unknown as ReturnType<typeof createTrpcOptions>,
    });

    try {
      const res = await app.inject({ method: "GET", url: "/failingQuery" });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toMatchObject({ error: { message: INTERNAL_ERROR_MESSAGE } });
      expect(res.body).not.toContain(param);
      expect(res.body.toLowerCase()).not.toContain("select");

      const errorLog = logLines.find((line) => line.includes("trpc.error"));
      expect(errorLog).toBeDefined();
      expect(errorLog).not.toContain(param);
      expect(errorLog?.toLowerCase()).not.toContain("select");
      // invalid_text_representation, from the driver error in the cause chain
      expect(errorLog).toContain("22P02");
    } finally {
      await app.close();
    }
  });
});
