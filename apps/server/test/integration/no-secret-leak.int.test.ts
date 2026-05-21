import { beforeEach, describe, expect, it } from "vitest";
import { toBase64 } from "@repo/util";
import { registerNewUser } from "../../../../packages/client/src/register";
import { loginUser } from "../../../../packages/client/src/login";
import { createCallerFactory } from "../../src/trpc";
import { appRouter } from "../../src/router";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { buildTestContext } from "../setup/test-context";

const createCaller = createCallerFactory(appRouter);

type CapturedCall = { path: string; input: unknown };

/**
 * Build a minimal TRPCClient-shaped shim that records every (path, input) the
 * client passes across the boundary, then forwards to the in-process server
 * caller. The integration test runs the REAL client code (`registerNewUser`,
 * `loginUser`) against this shim, so anything the client packages into a
 * request body gets recorded and can be grepped for known secrets.
 */
function captureClient(): {
  trpc: {
    register: {
      startRegistration: { mutate: (input: unknown) => Promise<unknown> };
      finishRegistration: { mutate: (input: unknown) => Promise<unknown> };
    };
    login: {
      startLogin: { mutate: (input: unknown) => Promise<unknown> };
      finishLogin: { mutate: (input: unknown) => Promise<unknown> };
    };
  };
  captured: CapturedCall[];
} {
  const captured: CapturedCall[] = [];
  const caller = createCaller(buildTestContext(undefined));

  function record<T>(path: string, fn: (input: unknown) => Promise<T>) {
    return {
      mutate: async (input: unknown) => {
        captured.push({ path, input });
        return await fn(input);
      },
    };
  }

  const trpc = {
    register: {
      startRegistration: record("register.startRegistration", (input) =>
        caller.register.startRegistration(
          input as Parameters<typeof caller.register.startRegistration>[0],
        ),
      ),
      finishRegistration: record("register.finishRegistration", (input) =>
        caller.register.finishRegistration(
          input as Parameters<typeof caller.register.finishRegistration>[0],
        ),
      ),
    },
    login: {
      startLogin: record("login.startLogin", (input) =>
        caller.login.startLogin(input as Parameters<typeof caller.login.startLogin>[0]),
      ),
      finishLogin: record("login.finishLogin", (input) =>
        caller.login.finishLogin(input as Parameters<typeof caller.login.finishLogin>[0]),
      ),
    },
  };

  return { trpc, captured };
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("no-secret-leak — real client code, real server (in-process)", () => {
  it("password and recoveryKey never appear in any tRPC input crossing the boundary", async () => {
    const email = "alice@example.com";
    const password = "correct-horse-battery-staple-DO-NOT-LEAK-XYZ";

    const { trpc, captured } = captureClient();

    // Drive the REAL client code so anything it bundles into a request body
    // is what gets captured.
    // @ts-expect-error — our shim matches the structural subset registerNewUser uses.
    const recoveryKey = await registerNewUser(trpc, email, password);

    // @ts-expect-error — our shim matches the structural subset loginUser uses.
    await loginUser(trpc, async () => {}, email, password);

    expect(captured.length).toBeGreaterThan(0);

    const recoveryKeyHex = Buffer.from(recoveryKey).toString("hex");
    const recoveryKeyB64 = toBase64(recoveryKey);

    for (const call of captured) {
      const serialized = JSON.stringify(call.input);
      expect(serialized.includes(password), `password plaintext leaked in ${call.path}`).toBe(
        false,
      );
      expect(serialized.includes(recoveryKeyHex), `recoveryKey (hex) leaked in ${call.path}`).toBe(
        false,
      );
      expect(
        serialized.includes(recoveryKeyB64),
        `recoveryKey (base64) leaked in ${call.path}`,
      ).toBe(false);
    }
  });
});
