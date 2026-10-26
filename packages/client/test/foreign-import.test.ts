import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ExportRecord,
  MAX_LONG_TEXT_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
} from "@repo/schema";
import { normalizeWebsite, parseWebsite, websiteLink, websiteUrl } from "@repo/util";
import { strToU8, zipSync } from "fflate";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/import/csv";
import {
  type ForeignImport,
  ForeignImportBuilder,
  finishRecord,
  importStoppedMessage,
} from "../src/import/foreign-import";
import { type ParseXml, type XmlElement } from "../src/import/keepass";
import {
  type ImportFileContents,
  openKeePassDatabase,
  readImportFile,
  type UnsupportedFileReason,
  UnsupportedImportFileError,
  WrongKdbxKeyError,
} from "../src/import/read-import-file";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, "fixtures/import", name)));

const { DOMParser } = new JSDOM().window;
const parseXml: ParseXml = (text) =>
  new DOMParser().parseFromString(text, "application/xml").documentElement as unknown as XmlElement;

function foreign(contents: ImportFileContents): ForeignImport {
  if (contents.kind !== "foreign")
    throw new Error(`Expected a foreign import, got ${contents.kind}`);
  return contents.foreign;
}

const read = (bytes: Uint8Array) => foreign(readImportFile(bytes, parseXml));

/** The records without what the import assigns (ids, vault, import time). */
function contents(imported: ForeignImport) {
  return imported.data.records.map(
    ({ id: _id, vaultId: _vaultId, updatedAt: _updatedAt, ...rest }: ExportRecord) => rest,
  );
}

const bytes = (text: string) => new TextEncoder().encode(text);

function reasonFor(file: Uint8Array): UnsupportedFileReason | undefined {
  try {
    readImportFile(file, parseXml);
  } catch (error) {
    if (error instanceof UnsupportedImportFileError) return error.reason;
    throw error;
  }
  return undefined;
}

describe("parseCsv", () => {
  it("reads quoted cells with commas, quotes and line breaks", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ]);
  });

  it("drops a BOM and blank rows, keeps empty cells", () => {
    expect(parseCsv("﻿a,b\n\n,2\n1,")).toEqual([
      ["a", "b"],
      ["", "2"],
      ["1", ""],
    ]);
  });
});

describe("websiteUrl", () => {
  it.each([
    ["https://example.com/a", "https://example.com/a"],
    ["example.com", "https://example.com"],
    ["sub.example.co.uk:8443/path", "https://sub.example.co.uk:8443/path"],
    ["192.168.1.1", "https://192.168.1.1"],
    ["androidapp://com.example", undefined],
    ["chrome://FirefoxAccounts", undefined],
    ["not a url", undefined],
  ])("%s → %s", (raw, expected) => {
    expect(websiteUrl(raw)).toBe(expected);
  });
});

describe("parseWebsite", () => {
  it.each([
    [
      "https://www.Example.com/a",
      { kind: "web", url: "https://www.Example.com/a", host: "example.com" },
    ],
    ["example.com:8443", { kind: "web", url: "https://example.com:8443", host: "example.com" }],
    [
      "androidapp://com.example.app",
      { kind: "app", platform: "android", appId: "com.example.app" },
    ],
    [
      "android://hash@com.example.app/",
      { kind: "app", platform: "android", appId: "com.example.app" },
    ],
    ["iosapp://com.example.app", { kind: "app", platform: "ios", appId: "com.example.app" }],
    ["ssh://git@example.com:22", { kind: "uri", scheme: "ssh", value: "ssh://git@example.com:22" }],
    ["javascript:alert(1)", { kind: "uri", scheme: "javascript", value: "javascript:alert(1)" }],
    ["https://", undefined],
    ["not a url", undefined],
    ["androidapp://", undefined],
  ])("%s", (raw, expected) => {
    expect(parseWebsite(raw)).toEqual(expected);
  });

  it.each([
    ["intranet", "https://intranet"],
    ["nas:8080/admin", "https://nas:8080/admin"],
    [" example.com ", "https://example.com"],
    ["mailto:a@example.com", "mailto:a@example.com"],
    ["androidapp://com.example", "androidapp://com.example"],
    ["my bank", "my bank"],
  ])("normalizeWebsite(%j) → %j", (raw, expected) => {
    expect(normalizeWebsite(raw)).toBe(expected);
  });

  it("links only http(s) websites", () => {
    expect(websiteLink("example.com")).toEqual({
      text: "example.com",
      href: "https://example.com",
    });
    expect(websiteLink("androidapp://com.example")).toEqual({ text: "Android app: com.example" });
    expect(websiteLink("ftp://files.example.com")).toEqual({ text: "ftp://files.example.com" });
    expect(websiteLink("javascript:alert(1)")).toEqual({ text: "javascript:alert(1)" });
  });
});

describe("ForeignImportBuilder", () => {
  it("counts what a record leaves behind only when the record is imported", () => {
    const builder = new ForeignImportBuilder("bitwarden");
    builder.add({ type: "login", title: "ok", leftBehind: { passkeys: 1, previousPasswords: 2 } });
    builder.add({
      type: "login",
      title: "bad",
      fields: { password: 42 as unknown as string },
      leftBehind: { passkeys: 1, attachments: 3 },
    });
    expect(builder.build().report).toEqual({
      skipped: [{ title: "bad", reason: "invalid" }],
      passkeys: 1,
      attachments: 0,
      previousPasswords: 2,
    });
  });
});

describe("importStoppedMessage", () => {
  it("says how far the import got, and nothing when it wrote nothing", () => {
    expect(importStoppedMessage({ written: 100, total: 250 })).toMatch(/100 of 250/);
    expect(importStoppedMessage({ written: 0, total: 250 })).toBeUndefined();
  });
});

describe("finishRecord", () => {
  it("names an untitled record after its host, then its username", () => {
    expect(finishRecord({ type: "login", websites: ["https://a.example.com/x"] })).toMatchObject({
      title: "a.example.com",
    });
    expect(finishRecord({ type: "login", fields: { username: "u" } })).toMatchObject({
      title: "u",
    });
    expect(finishRecord({ type: "login", fields: { email: "e@x.de" } })).toMatchObject({
      title: "e@x.de",
    });
    expect(finishRecord({ type: "note" })).toMatchObject({ title: "Imported item" });
  });

  it("cuts a long title and skips an item over the limits as too large", () => {
    expect(finishRecord({ type: "note", title: "t".repeat(MAX_TITLE_LENGTH + 10) })).toMatchObject({
      title: "t".repeat(MAX_TITLE_LENGTH),
    });
    expect(finishRecord({ type: "note", title: "t", note: "n".repeat(MAX_NOTE_LENGTH + 1) })).toBe(
      "too_large",
    );
    const customFields = Array.from({ length: 20 }, (_, i) => ({
      title: `f${i}`,
      value: "v".repeat(MAX_LONG_TEXT_LENGTH),
    }));
    expect(finishRecord({ type: "note", title: "t", customFields })).toBe("too_large");
  });

  it("keeps app ids and domains as websites, other text as a field, and drops empty values", () => {
    expect(
      finishRecord({
        type: "login",
        title: "App",
        fields: { username: "", password: "pw" },
        websites: ["androidapp://com.example", "", "example.com", "https://example.com", "my bank"],
        customFields: [
          { title: "", value: "x" },
          { title: "Empty", value: "  " },
        ],
        tags: ["a", " a ", ""],
        note: " ",
      }),
    ).toEqual({
      type: "login",
      title: "App",
      password: "pw",
      websites: [{ value: "androidapp://com.example" }, { value: "https://example.com" }],
      tags: ["a"],
      customFields: [
        { type: "text", title: "Field", value: "x" },
        { type: "text", title: "Website", value: "my bank" },
      ],
    });
  });

  it("turns a login's Email field into its email, unless the source gave one", () => {
    const customFields = [
      { title: "E-Mail Address", value: "a@example.com" },
      { title: "Email", value: "b@example.com" },
    ];
    expect(finishRecord({ type: "login", title: "t", customFields })).toMatchObject({
      email: "a@example.com",
      customFields: [{ type: "text", title: "Email", value: "b@example.com" }],
    });
    expect(
      finishRecord({ type: "login", title: "t", fields: { email: "c@example.com" }, customFields }),
    ).toMatchObject({ email: "c@example.com", customFields: expect.any(Array) });
    expect(
      finishRecord({ type: "note", title: "t", customFields: [customFields[1]!] }),
    ).not.toHaveProperty("email");
  });

  it("stamps the password date only when there is a password", () => {
    const at = "2024-01-01T00:00:00.000Z";
    expect(finishRecord({ type: "login", title: "t", passwordChangedAt: at })).not.toHaveProperty(
      "passwordChangedAt",
    );
    expect(
      finishRecord({ type: "login", title: "t", fields: { password: "p" }, passwordChangedAt: at }),
    ).toMatchObject({ passwordChangedAt: at });
  });
});

describe("browser CSV", () => {
  it("reads Chrome's export", () => {
    const imported = read(fixture("chrome.csv"));
    expect(imported.source).toBe("chrome");
    expect(contents(imported)).toEqual([
      {
        type: "login",
        title: "Example",
        username: "alice",
        password: "hunter2",
        websites: [{ value: "https://example.com/login" }],
        note: 'line one\r\nline "two"',
        createdAt: null,
      },
      {
        type: "login",
        title: "bank.example.org",
        username: "bob@example.org",
        password: "p4ss",
        websites: [{ value: "https://bank.example.org" }],
        createdAt: null,
      },
      {
        type: "login",
        title: "Android app",
        username: "carol",
        websites: [{ value: "android://hash@com.example.app/" }],
        createdAt: null,
      },
    ]);
  });

  it("reads Firefox's export with its dates", () => {
    const imported = read(fixture("firefox.csv"));
    expect(imported.source).toBe("firefox");
    expect(contents(imported)[0]).toEqual({
      type: "login",
      title: "mail.example.com",
      username: "dave",
      password: "d4ve-pw",
      passwordChangedAt: new Date(1650000000000).toISOString(),
      websites: [{ value: "https://mail.example.com" }],
      createdAt: new Date(1600000000000).toISOString(),
    });
    expect(imported.data.records).toHaveLength(2);
  });

  it("reads Safari's export with its one-time password", () => {
    const imported = read(fixture("safari.csv"));
    expect(imported.source).toBe("safari");
    expect(contents(imported)).toEqual([
      {
        type: "login",
        title: "Shop (eve)",
        username: "eve",
        password: "eve-pw",
        totp: "otpauth://totp/Shop:eve?secret=JBSWY3DPEHPK3PXP&issuer=Shop",
        websites: [{ value: "https://shop.example.com/" }],
        note: "Gift card in note",
        createdAt: null,
      },
    ]);
  });
});

describe("Bitwarden JSON", () => {
  const imported = read(fixture("bitwarden.json"));
  const [login, note, card, identity, sshKey] = contents(imported);

  it("maps a login with its folder, fields and dates", () => {
    expect(imported.source).toBe("bitwarden");
    expect(login).toEqual({
      type: "login",
      title: "GitHub",
      username: "octo",
      email: "octo@example.com",
      password: "new-pw",
      totp: "otpauth://totp/GitHub:octo?secret=JBSWY3DPEHPK3PXP",
      passwordChangedAt: "2024-03-01T10:00:00.000Z",
      websites: [
        { value: "https://github.com/login" },
        { value: "https://github.com" },
        { value: "androidapp://com.github.android" },
      ],
      note: "work account",
      favorite: true,
      tags: ["Work"],
      customFields: [
        { type: "text", title: "Recovery email", value: "ops@example.com" },
        { type: "secret", title: "PIN", value: "1234" },
        { type: "text", title: "Remember me", value: "true" },
      ],
      createdAt: "2020-05-01T08:00:00.000Z",
    });
  });

  it("maps notes, cards, identities and SSH keys", () => {
    expect(note).toMatchObject({ type: "note", title: "Door code", note: "4711" });
    expect(card).toMatchObject({
      type: "card",
      cardholderName: "Alice Example",
      number: "4111111111111111",
      expiry: "03/28",
      securityCode: "123",
      customFields: [{ type: "text", title: "Brand", value: "Visa" }],
    });
    expect(identity).toMatchObject({
      type: "identity",
      firstName: "Alice",
      street: "Main St 1\nApt 2",
      postalCode: "10115",
      customFields: [
        { type: "text", title: "Title", value: "Dr" },
        { type: "secret", title: "Social security number", value: "123-45-6789" },
      ],
    });
    expect(sshKey).toMatchObject({ type: "ssh_key", publicKey: "ssh-ed25519 AAAA test" });
  });

  it("reports what it left behind", () => {
    expect(imported.data.records).toHaveLength(5);
    expect(imported.report).toEqual({
      skipped: [{ title: "From the future", reason: "unsupported_type" }],
      passkeys: 1,
      attachments: 0,
      previousPasswords: 2,
    });
  });
});

describe("1Password 1PUX", () => {
  const zip = zipSync({
    "export.attributes": strToU8("{}"),
    "export.data": fixture("1password-export.data.json"),
  });
  const imported = read(zip);
  const byTitle = new Map(contents(imported).map((r) => [r.title, r]));

  it("maps a login with its one-time password, history date and vault tag", () => {
    expect(imported.source).toBe("1password");
    expect(byTitle.get("Example")).toEqual({
      type: "login",
      title: "Example",
      username: "alice",
      email: "alice@example.com",
      password: "pw-now",
      totp: "otpauth://totp/Ex:alice?secret=JBSWY3DPEHPK3PXP",
      passwordChangedAt: new Date(1650000000 * 1000).toISOString(),
      websites: [{ value: "https://example.com" }, { value: "https://login.example.com" }],
      note: "login note",
      favorite: true,
      tags: ["Private", "Work/Dev"],
      customFields: [{ type: "secret", title: "security answer", value: "blue" }],
      createdAt: new Date(1600000000 * 1000).toISOString(),
    });
  });

  it("maps cards, Wi-Fi, SSH keys and other categories as notes", () => {
    expect(byTitle.get("Visa")).toMatchObject({
      type: "card",
      cardholderName: "Alice Example",
      number: "4111111111111111",
      securityCode: "321",
      expiry: "09/27",
      customFields: [{ type: "text", title: "type", value: "visa" }],
    });
    expect(byTitle.get("Home Wi-Fi")).toMatchObject({
      type: "wifi",
      ssid: "HomeNet",
      password: "wifi-pw",
      security: "wpa2",
    });
    expect(byTitle.get("Deploy key")).toMatchObject({
      type: "ssh_key",
      publicKey: "ssh-ed25519 AAAA shared",
      tags: ["Shared"],
    });
    expect(byTitle.get("Bank account")).toMatchObject({
      type: "note",
      tags: ["Private", "Archived"],
      customFields: [
        { type: "text", title: "bank name", value: "Example Bank" },
        { type: "secret", title: "PIN", value: "9999" },
      ],
    });
  });

  it("skips documents and reports files, passkeys and history", () => {
    expect(imported.report).toEqual({
      skipped: [{ title: "Passport scan", reason: "unsupported_type" }],
      passkeys: 1,
      attachments: 1,
      previousPasswords: 2,
    });
  });
});

describe("KeePass XML", () => {
  const imported = read(fixture("keepass.xml"));
  const [bank, social, ...rest] = contents(imported);

  it("maps an entry with its custom strings, tags and password date", () => {
    expect(imported.source).toBe("keepass");
    expect(bank).toEqual({
      type: "login",
      title: "Bank",
      username: "alice",
      email: "alice@example.com",
      password: "current-pw",
      totp: "otpauth://totp/Bank:alice?secret=JBSWY3DPEHPK3PXP",
      passwordChangedAt: "2022-01-01T00:00:00.000Z",
      websites: [{ value: "https://bank.example.com" }],
      note: "bank login",
      tags: ["finance", "important"],
      customFields: [
        { type: "text", title: "Customer number", value: "12345" },
        { type: "secret", title: "Online PIN", value: "0000" },
      ],
      createdAt: "2020-01-01T00:00:00.000Z",
    });
  });

  it("tags by group path, reads KDBX 4 times and leaves out the recycle bin", () => {
    expect(social).toEqual({
      type: "login",
      title: "social.example.net",
      username: "bob",
      password: "bob-pw",
      websites: [{ value: "https://social.example.net" }],
      tags: ["Internet/Social"],
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    expect(rest).toEqual([]);
    expect(imported.report).toMatchObject({ attachments: 1, previousPasswords: 1 });
  });
});

describe("KeePass database", () => {
  const kdbx = (name: string) =>
    new Uint8Array(
      readFileSync(join(import.meta.dirname, "../../crypto/test/fixtures/kdbx", name)),
    );

  it("is handed over to be opened with its password", () => {
    const file = kdbx("keepassxc.kdbx");
    expect(readImportFile(file)).toEqual({ kind: "kdbx", file });
  });

  it("reads the decrypted database like a KeePass XML export", async () => {
    const imported = await openKeePassDatabase(
      kdbx("keepassxc.kdbx"),
      { password: "correct horse" },
      parseXml,
    );

    expect(imported.source).toBe("keepass");
    expect(contents(imported)).toEqual([
      expect.objectContaining({ title: "Bank", username: "bob", password: "second-pass" }),
      expect.objectContaining({
        title: "Example",
        username: "alice@example.com",
        password: "hunter2 & <ok>",
        websites: [{ value: "https://example.com" }],
        note: "first line",
        tags: ["Work"],
      }),
    ]);
  });

  it("opens with a key file and no password", async () => {
    const imported = await openKeePassDatabase(
      kdbx("keyfile-v2.kdbx"),
      { password: "", keyFile: kdbx("keyfile-v2.keyx") },
      parseXml,
    );
    expect(contents(imported)).toEqual([expect.objectContaining({ title: "Keyed" })]);
  });

  it("refuses a wrong password, and Twofish as unsupported", async () => {
    await expect(
      openKeePassDatabase(kdbx("keepassxc.kdbx"), { password: "nope" }, parseXml),
    ).rejects.toBeInstanceOf(WrongKdbxKeyError);

    const twofish = kdbx("keepassxc.kdbx");
    twofish.set([0xad, 0x68, 0xf2, 0x9f], 15);
    await expect(
      openKeePassDatabase(twofish, { password: "correct horse" }, parseXml),
    ).rejects.toMatchObject({ reason: "kdbx_unsupported" });
  });
});

describe("readImportFile", () => {
  it("passes this app's exports on as backups", () => {
    const file = bytes(
      JSON.stringify({
        format: "passmgr-export",
        version: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        recordSchemaVersion: 1,
        vaults: [],
        records: [],
      }),
    );
    expect(readImportFile(file).kind).toBe("backup");
  });

  it.each<[string, Uint8Array, UnsupportedFileReason]>([
    [
      "encrypted Bitwarden",
      bytes('{"encrypted":true,"passwordProtected":true,"data":"x"}'),
      "bitwarden_encrypted",
    ],
    [
      "Bitwarden CSV",
      bytes(
        "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n",
      ),
      "bitwarden_csv",
    ],
    [
      "1Password CSV",
      bytes("Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes\n"),
      "onepassword_csv",
    ],
    ["own CSV", bytes("vault,type,title,username,password\n"), "own_csv"],
    [
      "KeePass 1.x",
      new Uint8Array([0x03, 0xd9, 0xa2, 0x9a, 0x65, 0xfb, 0x4b, 0xb5]),
      "kdbx_unsupported",
    ],
    ["unknown CSV", bytes("a,b,c\n1,2,3\n"), "unsupported_format"],
    ["other JSON", bytes('{"hello":"world"}'), "unsupported_format"],
    ["other XML", bytes("<html></html>"), "unsupported_format"],
    ["broken zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), "unreadable"],
  ])("refuses %s", (_name, file, reason) => {
    expect(reasonFor(file)).toBe(reason);
  });

  it("puts every record in one new vault", () => {
    const imported = read(fixture("safari.csv"));
    expect(imported.data.vaults).toEqual([
      { id: imported.vaultId, name: "Safari", kind: "shared" },
    ]);
    expect(imported.data.records.every((r) => r.vaultId === imported.vaultId)).toBe(true);
  });
});
