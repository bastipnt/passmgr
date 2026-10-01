import { describe, expect, it } from "vitest";
import { stripQuery } from "../logger";
import { getConnectionParamsSave, isUniqueViolation } from "./general";

describe("getConnectionParamsSave", () => {
  it("extracts the four auth fields", () => {
    const params = { sessionId: "s", timestamp: "1", nonce: "n", signature: "sig" };
    expect(getConnectionParamsSave({ connectionParams: JSON.stringify(params) })).toEqual(params);
  });

  it.each([
    ["missing", {}],
    ["invalid JSON", { connectionParams: "{nope" }],
    ["JSON null", { connectionParams: "null" }],
  ])("returns {} when connectionParams is %s", (_label, query) => {
    expect(getConnectionParamsSave(query)).toEqual({});
  });

  it("drops non-string fields", () => {
    const raw = JSON.stringify({ sessionId: 42, nonce: "n", extra: "x" });
    expect(getConnectionParamsSave({ connectionParams: raw })).toEqual({ nonce: "n" });
  });
});

describe("stripQuery", () => {
  it("removes the query string (connectionParams must not be logged)", () => {
    expect(stripQuery("/trpc/record.onRecordChange?connectionParams=%7B%7D")).toBe(
      "/trpc/record.onRecordChange",
    );
    expect(stripQuery("/trpc/login.startLogin")).toBe("/trpc/login.startLogin");
  });
});

describe("isUniqueViolation", () => {
  it("detects the Postgres code directly and through wrapped causes", () => {
    const pgError = Object.assign(new Error("duplicate key"), { code: "23505" });
    expect(isUniqueViolation(pgError)).toBe(true);
    expect(isUniqueViolation(new Error("query failed", { cause: pgError }))).toBe(true);
  });

  it.each([
    ["another Postgres error", Object.assign(new Error("fk"), { code: "23503" })],
    ["a plain error", new Error("boom")],
    ["a non-error", "23505"],
    ["undefined", undefined],
  ])("is false for %s", (_label, error) => {
    expect(isUniqueViolation(error)).toBe(false);
  });
});
