import { describe, expect, it } from "vitest";
import { loginRecordSchema } from "../src/login-record-schema";

const MIN_RECORD = { title: "My account" };

describe("loginRecordSchema title", () => {
  it("accepts a single-character title", () => {
    expect(() => loginRecordSchema.parse({ title: "x" })).not.toThrow();
  });

  it("rejects an empty title", () => {
    expect(() => loginRecordSchema.parse({ title: "" })).toThrow();
  });

  it("rejects when title is missing", () => {
    expect(() => loginRecordSchema.parse({})).toThrow();
  });
});

describe("loginRecordSchema websites", () => {
  it("accepts empty websites array", () => {
    expect(() => loginRecordSchema.parse({ ...MIN_RECORD, websites: [] })).not.toThrow();
  });

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

  it("rejects entries with an invalid URL", () => {
    expect(() =>
      loginRecordSchema.parse({ ...MIN_RECORD, websites: [{ value: "not a url" }] }),
    ).toThrow();
  });
});

describe("loginRecordSchema extraFields", () => {
  it("accepts text and secret types", () => {
    expect(() =>
      loginRecordSchema.parse({
        ...MIN_RECORD,
        extraFields: [
          { type: "text", title: "PIN", value: "1234" },
          { type: "secret", title: "BackupCode", value: "abcd" },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects unknown type", () => {
    expect(() =>
      loginRecordSchema.parse({
        ...MIN_RECORD,
        extraFields: [{ type: "password", title: "x", value: "y" }],
      }),
    ).toThrow();
  });

  it.each([
    ["empty title", { type: "text", title: "", value: "y" }],
    ["empty value", { type: "secret", title: "x", value: "" }],
  ])("rejects %s", (_label, field) => {
    expect(() => loginRecordSchema.parse({ ...MIN_RECORD, extraFields: [field] })).toThrow();
  });
});

describe("loginRecordSchema optional fields", () => {
  it("accepts everything optional omitted", () => {
    expect(() => loginRecordSchema.parse(MIN_RECORD)).not.toThrow();
  });

  it("accepts all optionals set", () => {
    expect(() =>
      loginRecordSchema.parse({
        title: "Acme",
        username: "alice",
        password: "secret",
        totp: "JBSWY3DPEHPK3PXP",
        category: "work",
        note: "n/a",
        websites: [{ value: "https://acme.com" }],
        extraFields: [{ type: "text", title: "PIN", value: "1234" }],
      }),
    ).not.toThrow();
  });
});
