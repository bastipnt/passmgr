import { TRPCError } from "@trpc/server";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createCaller } from "../integration/_helpers";
import { buildTestContext } from "../setup/test-context";

type Caller = ReturnType<typeof createCaller>;
type Call = (caller: Caller, input: unknown) => Promise<unknown>;

const PROCEDURES: ReadonlyArray<readonly [string, Call]> = [
  ["login.startLogin", (c, i) => c.login.startLogin(i as never)],
  ["login.finishLogin", (c, i) => c.login.finishLogin(i as never)],
  ["register.startRegistration", (c, i) => c.register.startRegistration(i as never)],
  ["register.finishRegistration", (c, i) => c.register.finishRegistration(i as never)],
  ["user.create", (c, i) => c.user.create(i as never)],
];

describe("tRPC boundary fuzz — never throws untyped on arbitrary JSON", () => {
  for (const [name, call] of PROCEDURES) {
    it(`${name} returns or throws TRPCError`, async () => {
      const caller = createCaller(buildTestContext(undefined));
      await fc.assert(
        fc.asyncProperty(fc.jsonValue(), async (input) => {
          try {
            await call(caller, input);
          } catch (e) {
            expect(e).toBeInstanceOf(TRPCError);
          }
        }),
        { numRuns: 50 },
      );
    });
  }
});
