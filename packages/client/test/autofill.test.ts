import type { DecryptedRecord } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { autofillEntries } from "../src/records/autofill";

function makeRecord(recordId: string, fields: Record<string, unknown> = {}): DecryptedRecord {
  return {
    recordId,
    version: 1,
    schemaVersion: 1,
    type: "login",
    title: recordId,
    clientUpdatedAt: "2026-09-01T10:00:00.000Z",
    created_at: null,
    firstCreatedAt: null,
    ...fields,
  } as DecryptedRecord;
}

describe("autofillEntries", () => {
  it("offers logins with a password, by title, with their website hosts once each", () => {
    const entries = autofillEntries([
      makeRecord("b", {
        title: "GitHub",
        username: "octo",
        password: "pw-1",
        websites: [
          { value: "https://www.github.com/login" },
          { value: "github.com" },
          { value: "https://gist.github.com" },
          { value: "" },
        ],
      }),
      makeRecord("a", { title: "Atlassian", password: "pw-2" }),
    ]);

    expect(entries).toEqual([
      { recordId: "a", title: "Atlassian", username: "", password: "pw-2", hosts: [] },
      {
        recordId: "b",
        title: "GitHub",
        username: "octo",
        password: "pw-1",
        hosts: ["github.com", "gist.github.com"],
      },
    ]);
  });

  it("leaves out logins without a password and other record types", () => {
    const entries = autofillEntries([
      makeRecord("no-password", { username: "someone" }),
      makeRecord("wifi", { type: "wifi", ssid: "home", password: "pw" }),
    ]);

    expect(entries).toEqual([]);
  });
});
