import type { LoginRecord, RecordData } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { type MergeVersion, mergeRecord, sameRecordData } from "../src/records/merge-record";

const base: LoginRecord = {
  type: "login",
  title: "GitHub",
  username: "jana",
  password: "old",
  note: "base note",
};

function at(minute: number, data: Partial<RecordData>, deleted = false): MergeVersion {
  return {
    data: { ...base, ...data } as RecordData,
    editedAt: new Date(Date.UTC(2026, 9, 6, 10, minute)).toISOString(),
    deleted,
  };
}

describe("mergeRecord", () => {
  it("takes each side's own changes", () => {
    const merged = mergeRecord(base, [at(0, { note: "A" })], [at(5, { username: "bob" })]);

    expect(merged).toEqual({ data: { ...base, note: "A", username: "bob" }, deleted: false });
  });

  it("lets the later edit win a field changed on both sides, whichever synced last", () => {
    const local = [at(0, { username: "early" })];
    const remote = [at(5, { username: "late" })];

    expect(mergeRecord(base, local, remote).data).toMatchObject({ username: "late" });
    expect(mergeRecord(base, remote, local).data).toMatchObject({ username: "late" });
  });

  it("keeps a value both sides agree on", () => {
    const merged = mergeRecord(base, [at(9, { password: "new" })], [at(1, { password: "new" })]);

    expect(merged.data).toMatchObject({ password: "new" });
  });

  it("times a field in a chain of offline edits by the last version that changed it", () => {
    // The local chain ends at 10:20, but its username dates from 10:00.
    const local = [at(0, { username: "offline" }), at(20, { username: "offline", note: "later" })];
    const remote = [at(10, { username: "online" })];

    expect(mergeRecord(base, local, remote).data).toMatchObject({
      username: "online",
      note: "later",
    });
  });

  it("counts a field changed and changed back as unchanged", () => {
    const local = [at(0, { username: "temp" }), at(1, { username: "jana" })];

    expect(mergeRecord(base, local, [at(5, { note: "B" })]).data).toEqual({ ...base, note: "B" });
  });

  it("adds and removes fields", () => {
    const merged = mergeRecord(
      base,
      [at(0, { totp: "JBSWY3DP" })],
      [at(5, { note: undefined, password: "pw" })],
    );

    expect(merged.data).toEqual({ ...base, totp: "JBSWY3DP", note: undefined, password: "pw" });
    expect("note" in merged.data).toBe(false);
  });

  it("treats empty and missing values alike", () => {
    const noNote = { ...base, note: undefined };
    const local = [at(0, { note: "" })];
    const remote = [at(5, { note: undefined, username: "bob" })];

    const merged = mergeRecord(noNote, local, remote).data;
    expect(sameRecordData(merged, { ...noNote, username: "bob" })).toBe(true);
    expect(sameRecordData({ ...base, totp: "" }, { ...base, tags: [] })).toBe(true);
  });

  it("merges websites and custom fields as one field each", () => {
    const merged = mergeRecord(
      base,
      [at(0, { websites: [{ value: "https://a.example" }] })],
      [at(5, { websites: [{ value: "https://b.example" }] })],
    );

    expect((merged.data as LoginRecord).websites).toEqual([{ value: "https://b.example" }]);
  });

  it("compares list items regardless of key order", () => {
    const field = { type: "text" as const, title: "PIN", value: "1" };
    const reordered = { value: "1", title: "PIN", type: "text" as const };
    const withField = { ...base, customFields: [field] };

    const local = [at(0, { customFields: [reordered] })];
    const merged = mergeRecord(withField, local, [at(5, { customFields: [field] })]);

    expect(merged.data.customFields).toEqual([reordered]);
    expect(sameRecordData(withField, { ...withField, customFields: [reordered] })).toBe(true);
  });

  it("merges tags per tag", () => {
    const tagged = { ...base, tags: ["work", "old"] };
    const merged = mergeRecord(
      tagged,
      [at(0, { tags: ["work", "old", "mine"] })],
      [at(5, { tags: ["work", "theirs"] })],
    );

    expect(merged.data.tags).toEqual(["work", "mine", "theirs"]);
  });

  it("takes the whole later record when a side changed the type", () => {
    const note = { ...base, type: "note" } as unknown as Partial<RecordData>;
    const local = [at(10, note)];
    const remote = [at(5, { username: "bob" })];

    expect(mergeRecord(base, local, remote).data).toMatchObject({ type: "note", username: "jana" });
    expect(mergeRecord(base, [at(0, note)], remote).data).toMatchObject({
      type: "login",
      username: "bob",
    });
  });

  it("restores a record deleted on one side and edited on the other", () => {
    const deleted = mergeRecord(base, [at(9, {}, true)], [at(5, { username: "bob" })]);
    const edited = mergeRecord(base, [at(0, { note: "A" })], [at(5, {}, true)]);

    expect(deleted).toEqual({ data: { ...base, username: "bob" }, deleted: false });
    expect(edited).toEqual({ data: { ...base, note: "A" }, deleted: false });
  });

  it("keeps edits made before a delete, and the delete when both sides deleted", () => {
    const local = [at(0, { note: "A" }), at(1, { note: "A" }, true)];

    expect(mergeRecord(base, local, [at(5, {}, true)])).toEqual({
      data: { ...base, note: "A" },
      deleted: true,
    });
  });
});
