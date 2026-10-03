import type { RecordData } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { hasEditForm, loginFormDefaults, loginRecordFromForm } from "../src/records/record-edit";
import { getRecordFieldSpecs } from "../src/records/record-field-specs";
import { getRecordSubtitle, getRecordWebsites } from "../src/records/record-summary";

function summary(record: RecordData, options?: { includeTitle?: boolean }) {
  return getRecordFieldSpecs(record, options).map(({ key, group, kind, value, values }) => ({
    key,
    group,
    kind,
    value: value ?? values,
  }));
}

describe("getRecordFieldSpecs", () => {
  it("lists a login's fields in render order, username and password even when empty", () => {
    const record: RecordData = {
      type: "login",
      title: "GitHub",
      websites: [{ value: "https://github.com" }],
      note: "work",
      customFields: [{ type: "secret", title: "PIN", value: "1234" }],
    };

    expect(summary(record, { includeTitle: true })).toEqual([
      { key: "title", group: "title", kind: "title", value: "GitHub" },
      { key: "username", group: "fields", kind: "username", value: undefined },
      { key: "password", group: "fields", kind: "password", value: undefined },
      { key: "websites", group: "websites", kind: "websites", value: ["https://github.com"] },
      { key: "note", group: "note", kind: "note", value: "work" },
      { key: "custom:PIN:0", group: "custom", kind: "secret", value: "1234" },
    ]);
  });

  it("leaves out empty fields of other types", () => {
    const record: RecordData = { type: "card", title: "Visa", number: "4111", expiry: "" };

    expect(summary(record)).toEqual([
      { key: "number", group: "fields", kind: "secret", value: "4111" },
    ]);
  });

  it("formats non-string fields for display", () => {
    const record: RecordData = { type: "wifi", title: "Home", security: "wpa3", hidden: true };

    expect(summary(record).map(({ value }) => value)).toEqual(["WPA3", "Yes"]);
  });

  it("leaves out a field whose formatter has nothing to show", () => {
    const record: RecordData = { type: "wifi", title: "Home", ssid: "FRITZ!Box", hidden: false };

    expect(summary(record).map(({ key }) => key)).toEqual(["ssid"]);
  });

  it("gives a secure note only its body", () => {
    const record: RecordData = { type: "note", title: "Door", note: "1234#" };

    expect(summary(record)).toEqual([{ key: "note", group: "note", kind: "note", value: "1234#" }]);
  });
});

describe("getRecordSubtitle", () => {
  it.each<[string, RecordData, string | undefined]>([
    ["a login's username", { type: "login", title: "x", username: "lin" }, "lin"],
    [
      "a card's last four digits",
      { type: "card", title: "x", number: "4111 1111 1111 4242" },
      "•••• 4242",
    ],
    ["no digits of a short card number", { type: "card", title: "x", number: "42" }, undefined],
    [
      "an identity's name",
      { type: "identity", title: "x", firstName: "Lin", lastName: "Park" },
      "Lin Park",
    ],
    [
      "an identity's email without a name",
      { type: "identity", title: "x", email: "l@x.de" },
      "l@x.de",
    ],
    ["a Wi-Fi's network name", { type: "wifi", title: "x", ssid: "FRITZ!Box" }, "FRITZ!Box"],
    ["nothing for a note", { type: "note", title: "x", note: "secret" }, undefined],
  ])("shows %s", (_label, record, expected) => {
    expect(getRecordSubtitle(record)).toBe(expected);
  });
});

describe("getRecordWebsites", () => {
  it("only logins have websites", () => {
    const websites = [{ value: "https://a.example" }];
    expect(getRecordWebsites({ type: "login", title: "x", websites })).toBe(websites);
    expect(getRecordWebsites({ type: "api_key", title: "x", host: "a.example" })).toBeUndefined();
  });
});

describe("login form helpers", () => {
  it("keeps the fields the form doesn't edit", () => {
    const current: RecordData = {
      type: "login",
      title: "Old",
      favorite: true,
      tags: ["work"],
      username: "old",
    };

    expect(loginRecordFromForm({ title: "New", username: "new" }, current)).toEqual({
      type: "login",
      title: "New",
      username: "new",
      favorite: true,
      tags: ["work"],
      attachments: undefined,
    });
  });

  it("refuses to save a record of another type as a login", () => {
    const wifi: RecordData = { type: "wifi", title: "Home", ssid: "FRITZ!Box" };

    expect(hasEditForm(wifi)).toBe(false);
    expect(() => loginRecordFromForm({ title: "Home" }, wifi)).toThrow(/wifi record/);
  });

  it("fills only the shared fields from a record of another type", () => {
    const record: RecordData = { type: "wifi", title: "Home", password: "pw", note: "n" };

    expect(loginFormDefaults(record)).toEqual({
      title: "Home",
      note: "n",
      customFields: undefined,
    });
  });
});
