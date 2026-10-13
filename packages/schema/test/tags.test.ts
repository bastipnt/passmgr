import { describe, expect, it } from "vitest";
import {
  MAX_TAG_LENGTH,
  MAX_TAGS,
  normalizeTags,
  sanitizeTag,
  tagSchema,
  tagsFormSchema,
} from "../src/tags";

describe("normalizeTags", () => {
  it("trims, collapses whitespace and keeps the first spelling of a tag", () => {
    expect(normalizeTags(["  Home  office ", "home office", "", "Work"])).toEqual([
      "Home office",
      "Work",
    ]);
  });

  it("reads a missing list as empty", () => {
    expect(normalizeTags(undefined)).toEqual([]);
  });
});

describe("sanitizeTag", () => {
  it("replaces commas and cuts an over-long tag", () => {
    expect(sanitizeTag("Banking, Taxes")).toBe("Banking Taxes");
    expect(sanitizeTag("x".repeat(MAX_TAG_LENGTH + 10))).toHaveLength(MAX_TAG_LENGTH);
  });
});

describe("tag form schemas", () => {
  it("refuses an empty, over-long or comma tag", () => {
    expect(tagSchema.safeParse("  ").success).toBe(false);
    expect(tagSchema.safeParse("x".repeat(MAX_TAG_LENGTH + 1)).success).toBe(false);
    expect(tagSchema.safeParse("a,b").success).toBe(false);
    expect(tagSchema.parse("  a   b ")).toBe("a b");
  });

  it("caps the tags of a record", () => {
    const tags = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`);
    expect(tagsFormSchema.safeParse(tags).success).toBe(false);
    expect(tagsFormSchema.safeParse(tags.slice(1)).success).toBe(true);
  });
});
