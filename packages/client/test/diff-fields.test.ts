import { describe, expect, it } from "vitest";
import { alignFieldSpecs } from "../src/records/diff-fields";
import type { FieldSpec } from "../src/records/record-field-specs";

function spec(key: string, compare: string): FieldSpec {
  return { key, group: "custom", compare, kind: "text", label: key };
}

describe("alignFieldSpecs", () => {
  it("pairs identical fields as unchanged", () => {
    const rows = alignFieldSpecs([spec("username", "a")], [spec("username", "a")]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "username", status: "unchanged" });
    expect(rows[0]!.old).toBeDefined();
    expect(rows[0]!.latest).toBeDefined();
  });

  it("marks a differing value as edited and keeps both sides", () => {
    const rows = alignFieldSpecs([spec("password", "old")], [spec("password", "new")]);

    expect(rows[0]!.status).toBe("edited");
    expect(rows[0]!.old!.compare).toBe("old");
    expect(rows[0]!.latest!.compare).toBe("new");
  });

  it("marks a field only the latest revision has as added", () => {
    const rows = alignFieldSpecs(
      [spec("username", "a")],
      [spec("username", "a"), spec("note", "n")],
    );

    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ["username", "unchanged"],
      ["note", "added"],
    ]);
    expect(rows[1]!.old).toBeUndefined();
  });

  it("marks a field only the old revision has as removed", () => {
    const rows = alignFieldSpecs(
      [spec("username", "a"), spec("totp", "t")],
      [spec("username", "a")],
    );

    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ["username", "unchanged"],
      ["totp", "removed"],
    ]);
    expect(rows[1]!.latest).toBeUndefined();
  });

  it("aligns a field inserted in the middle without shifting later rows", () => {
    const rows = alignFieldSpecs(
      [spec("username", "a"), spec("note", "n")],
      [spec("username", "a"), spec("totp", "t"), spec("note", "n")],
    );

    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ["username", "unchanged"],
      ["totp", "added"],
      ["note", "unchanged"],
    ]);
  });

  it("keeps duplicate custom-field titles apart by occurrence", () => {
    const rows = alignFieldSpecs(
      [spec("custom:PIN:0", "text 1"), spec("custom:PIN:1", "text 2")],
      [spec("custom:PIN:0", "text 1"), spec("custom:PIN:1", "text 9")],
    );

    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ["custom:PIN:0", "unchanged"],
      ["custom:PIN:1", "edited"],
    ]);
  });

  it("shows a reordered field on both sides", () => {
    const rows = alignFieldSpecs(
      [spec("title", "1"), spec("username", "2")],
      [spec("username", "2"), spec("title", "1")],
    );

    // The displaced field is shown as removed and re-added; the field it moved
    // past re-pairs on the next step rather than being duplicated.
    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ["title", "removed"],
      ["username", "unchanged"],
      ["title", "added"],
    ]);
  });

  it("handles two empty revisions", () => {
    expect(alignFieldSpecs([], [])).toEqual([]);
  });
});
