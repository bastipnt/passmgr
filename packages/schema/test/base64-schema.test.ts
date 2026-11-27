import { describe, expect, it } from "vitest";
import { canonicalBase64 } from "../src/base64-schema";
import { nonCanonicalBase64 as nonCanonical } from "../testing/non-canonical";

const VALUE = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");

describe("canonicalBase64", () => {
  it("accepts canonical base64", () => {
    expect(canonicalBase64().parse(VALUE)).toBe(VALUE);
  });

  it("rejects a non-canonical encoding of the same bytes", () => {
    expect(canonicalBase64().safeParse(nonCanonical(VALUE)).success).toBe(false);
  });
});
