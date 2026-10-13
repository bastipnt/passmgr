import { describe, expect, it } from "vitest";
import { newLoginValues, sharedWebsite } from "../src/records/shared-login";

describe("sharedWebsite", () => {
  it.each([
    ["https://www.example.com/login?next=1", "https://www.example.com/login?next=1"],
    ["  example.com  ", "https://example.com"],
    ["Sign in at https://example.com/a. Thanks", "https://example.com/a"],
    ["Example Domain\nhttps://example.com", "https://example.com"],
    ["https://example.com/a Example Domain", "https://example.com/a"],
    ["https://example.com/search?q=a+b", "https://example.com/search?q=a+b"],
    ["just some text", undefined],
    ["javascript:alert(1)", undefined],
    ["", undefined],
  ])("%j → %s", (text, expected) => {
    expect(sharedWebsite(text)).toBe(expected);
  });
});

describe("newLoginValues", () => {
  it("titles the login by the website's host", () => {
    expect(newLoginValues("https://www.example.com/login")).toEqual({
      title: "example.com",
      websites: [{ value: "https://www.example.com/login" }],
    });
  });
});
