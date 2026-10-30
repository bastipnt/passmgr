import { describe, expect, it } from "vitest";
import { IMPORT_SOURCE_LIST } from "../src/import/foreign-import";
import { emptyCategoryCreateType } from "../src/providers/SortedRecordsProvider";

describe("emptyCategoryCreateType", () => {
  it("offers the type of a type category", () => {
    expect(emptyCategoryCreateType("ssh_key")).toBe("ssh_key");
  });

  it("offers nothing for all items, favorites or picked tags", () => {
    expect(emptyCategoryCreateType("all")).toBeUndefined();
    expect(emptyCategoryCreateType("favorites")).toBeUndefined();
    expect(emptyCategoryCreateType("card", ["work"])).toBeUndefined();
  });
});

describe("IMPORT_SOURCE_LIST", () => {
  it("names every source, the last after 'or'", () => {
    expect(IMPORT_SOURCE_LIST).toBe(
      "Chrome / Edge, Firefox, Safari, Bitwarden, 1Password or KeePass",
    );
  });
});
