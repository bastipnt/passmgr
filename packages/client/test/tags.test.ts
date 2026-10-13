import type { DecryptedRecord } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { collectTags, diffTags, hasTag, removeTagFrom, renameTagIn } from "../src/records/tags";

const withTags = (tags?: string[]) => ({ type: "note", title: "x", tags }) as DecryptedRecord;

describe("collectTags", () => {
  it("counts each tag once per record, matched without case, A–Z", () => {
    const tags = collectTags([
      withTags(["work", "Banking"]),
      withTags(["Work", "work"]),
      withTags(["Work"]),
      withTags(),
    ]);

    expect(tags).toEqual([
      { tag: "Banking", count: 1 },
      // The most used spelling.
      { tag: "Work", count: 3 },
    ]);
  });
});

describe("tag edits", () => {
  it("finds a tag without case", () => {
    expect(hasTag(withTags(["Work"]), "work")).toBe(true);
    expect(hasTag(withTags(), "work")).toBe(false);
  });

  it("renames a tag, merging it into one the record already has", () => {
    expect(renameTagIn(["work", "home"], "Work", "Job")).toEqual(["Job", "home"]);
    expect(renameTagIn(["work", "home"], "work", "Home")).toEqual(["Home"]);
  });

  it("removes a tag without case", () => {
    expect(removeTagFrom(["Work", "home"], "work")).toEqual(["home"]);
  });

  it("diffs two tag lists, a change of casing apart", () => {
    expect(diffTags(["work", "home"], ["Work", "bank"])).toEqual({
      added: ["bank"],
      removed: ["home"],
      respelled: [{ from: "work", to: "Work" }],
    });
    expect(diffTags(undefined, undefined)).toEqual({ added: [], removed: [], respelled: [] });
  });
});
