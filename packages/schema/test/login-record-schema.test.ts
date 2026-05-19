import { describe, expect, it } from "vitest";
import { loginRecordSchema } from "../src/login-record-schema";

const MIN_RECORD = { title: "My account" };

describe("loginRecordSchema websites (empty string OR valid URL)", () => {
  it("accepts entries with empty-string value", () => {
    expect(() =>
      loginRecordSchema.parse({ ...MIN_RECORD, websites: [{ value: "" }] }),
    ).not.toThrow();
  });

  it("accepts entries with a valid URL", () => {
    expect(() =>
      loginRecordSchema.parse({ ...MIN_RECORD, websites: [{ value: "https://example.com" }] }),
    ).not.toThrow();
  });

  it("rejects entries with a non-empty, non-URL string", () => {
    expect(() =>
      loginRecordSchema.parse({ ...MIN_RECORD, websites: [{ value: "not a url" }] }),
    ).toThrow();
  });
});
