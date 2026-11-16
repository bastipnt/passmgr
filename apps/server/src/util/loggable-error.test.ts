import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDatabaseError, loggableError } from "./loggable-error";

const PARAM = "param-DO-NOT-LEAK";

function pgError() {
  return Object.assign(new Error(`invalid input syntax for type integer: "${PARAM}"`), {
    severity: "ERROR",
    code: "22P02",
    detail: `Key (email)=(${PARAM}) already exists`,
  });
}

function queryError(params: string[] = [PARAM]) {
  return new DrizzleQueryError("select $1::int", params, pgError());
}

describe("loggableError", () => {
  it("keeps the type, code and frames of a failed query, never its SQL, params or values", () => {
    const wrapped = new Error(queryError().message, { cause: queryError() });
    const logged = JSON.stringify(loggableError(wrapped));
    expect(logged).not.toContain(PARAM);
    expect(logged).not.toContain("select");
    expect(logged).toContain("DrizzleQueryError");
    expect(logged).toContain("22P02");
    expect(logged).toContain("loggable-error.test.ts");
  });

  it("drops message lines that look like stack frames", () => {
    const logged = JSON.stringify(loggableError(queryError([`x\n    at ${PARAM}`])));
    expect(logged).not.toContain(PARAM);
  });

  it("keeps the message of an error that wraps no database error", () => {
    const logged = loggableError(new TypeError("boom", { cause: new Error("inner") }));
    expect(logged).toMatchObject({
      type: "TypeError",
      message: "boom",
      cause: { type: "Error", message: "inner" },
    });
  });

  it("walks an AggregateError's errors", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    expect(loggableError(new AggregateError([refused]))).toMatchObject({
      type: "AggregateError",
      errors: [{ code: "ECONNREFUSED", message: "connect ECONNREFUSED" }],
    });
  });
});

describe("hasDatabaseError", () => {
  it("finds a driver error down the cause chain", () => {
    expect(hasDatabaseError(new Error("wrapped", { cause: queryError() }))).toBe(true);
    expect(hasDatabaseError(new AggregateError([queryError()]))).toBe(true);
    expect(hasDatabaseError(new Error("plain"))).toBe(false);
  });
});
