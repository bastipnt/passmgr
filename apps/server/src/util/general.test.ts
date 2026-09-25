import { describe, expect, it } from "vitest";
import { stripQuery } from "../logger";
import { getConnectionParamsSave } from "./general";

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
