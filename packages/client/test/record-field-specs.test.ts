import { generateSshKeyPair } from "@repo/crypto";
import type { RecordData } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { recordFormDefaults, recordFromForm } from "../src/records/record-edit";
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

describe("derived fields", () => {
  it("adds a card's network and a key's fingerprint only when asked", () => {
    const card: RecordData = { type: "card", title: "x", number: "4111111111111111" };
    const ssh: RecordData = {
      type: "ssh_key",
      title: "x",
      publicKey:
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMk5TTjKvYt2fXcgU9jovWCt5PkExCus5i2+9D/hf2HA test@example",
    };

    expect(summary(card).map(({ key }) => key)).toEqual(["number"]);
    expect(getRecordFieldSpecs(card, { includeDerived: true }).at(-1)).toMatchObject({
      key: "brand",
      value: "Visa",
      derived: true,
    });
    expect(getRecordFieldSpecs(ssh, { includeDerived: true }).at(-1)).toMatchObject({
      key: "fingerprint",
      value: "SHA256:dcQ/F9kOdnKBfKHQeHp2TAtEay17/DecDTQyoHCXkLA",
    });
  });

  it("groups a card number for display", () => {
    const card: RecordData = { type: "card", title: "x", number: "378282246310005" };

    expect(summary(card)[0]?.value).toBe("3782 822463 10005");
    expect(getRecordFieldSpecs(card)[0]?.copyValue).toBe("378282246310005");
  });
});

describe("form helpers", () => {
  it("keeps the fields the form doesn't edit", () => {
    const current: RecordData = {
      type: "login",
      title: "Old",
      favorite: true,
      tags: ["work"],
      username: "old",
    };

    expect(recordFromForm("login", { title: "New", username: "new" }, current)).toEqual({
      type: "login",
      title: "New",
      username: "new",
      websites: undefined,
      favorite: true,
      tags: ["work"],
      attachments: undefined,
    });
  });

  it("refuses to save a record through another type's form", () => {
    const wifi: RecordData = { type: "wifi", title: "Home", ssid: "FRITZ!Box" };

    expect(() => recordFromForm("login", { title: "Home" }, wifi)).toThrow(/wifi record/);
  });

  it("drops blank websites and normalises the rest", () => {
    const record = recordFromForm("login", {
      title: "x",
      websites: [{ value: " " }, { value: "github.com" }],
    });

    expect(record.websites).toEqual([{ value: "https://github.com" }]);
  });

  it("keeps a card number that isn't one as written", () => {
    expect(recordFromForm("card", { title: "x", number: "see note" }).number).toBe("see note");
  });

  it("stores a card number as digits", () => {
    expect(recordFromForm("card", { title: "x", number: "4111 1111-1111 1111" }).number).toBe(
      "4111111111111111",
    );
    expect(recordFromForm("card", { title: "x", number: " " }).number).toBeUndefined();
  });

  it("fills a missing public key from the private key", () => {
    const record = recordFromForm("ssh_key", {
      title: "x",
      privateKey: generateSshKeyPair("me@host").privateKey,
    });

    expect(record.publicKey).toMatch(/^ssh-ed25519 \S+ me@host$/);
  });

  it("fills the form with everything but the fields it doesn't edit", () => {
    const record: RecordData = {
      type: "wifi",
      title: "Home",
      password: "pw",
      favorite: true,
      tags: ["home"],
    };

    expect(recordFormDefaults(record)).toEqual({ title: "Home", password: "pw" });
  });
});
