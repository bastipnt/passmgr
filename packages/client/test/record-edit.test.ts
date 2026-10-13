import type { LoginFormValues, LoginRecord } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { duplicateValues, recordFromForm } from "../src/records/record-edit";

const login: LoginRecord = {
  type: "login",
  title: "GitHub",
  username: "me",
  password: "hunter2",
  passwordChangedAt: "2025-01-01T00:00:00.000Z",
  websites: [{ value: "https://github.com" }],
  totp: "otpauth://totp/GitHub?secret=ABC",
  note: "work account",
  tags: ["work"],
  customFields: [{ type: "secret", title: "PIN", value: "1234" }],
  favorite: true,
};

describe("duplicateValues", () => {
  it("copies the content under a new title, without the star or password age", () => {
    expect(duplicateValues(login)).toEqual({
      title: "GitHub (copy)",
      username: "me",
      password: "hunter2",
      websites: [{ value: "https://github.com" }],
      totp: "otpauth://totp/GitHub?secret=ABC",
      note: "work account",
      tags: ["work"],
      customFields: [{ type: "secret", title: "PIN", value: "1234" }],
    });
  });

  it("saves as a new, unstarred record", () => {
    const values = duplicateValues(login) as LoginFormValues;
    const record = recordFromForm("login", values);
    expect(record.favorite).toBeUndefined();
    expect(record.passwordChangedAt).toBeUndefined();
    expect(record.tags).toEqual(["work"]);
  });
});
