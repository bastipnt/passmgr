import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  type RecordPayload,
  UnknownRecordTypeError,
  UnsupportedSchemaVersionError,
  upgradeRecordPayload,
} from "../src/record-payload";
import {
  isRecordType,
  loginRecordSchema,
  RECORD_TYPES,
  type RecordData,
  type RecordOfType,
  type RecordType,
  recordDataSchema,
} from "../src/record-types";
import { edgeCaseLoginRecords, exampleLoginRecords } from "../src/seed/login-record-seed";

const MIN_LOGIN = { type: "login", title: "My account" } as const;

/** One fully populated record per type, each under its own type's key. */
const RECORDS: { [T in RecordType]: RecordOfType<T> } = {
  login: {
    type: "login",
    title: "GitHub",
    username: "octo",
    password: "hunter2",
    websites: [{ value: "https://github.com" }],
    totp: "JBSWY3DPEHPK3PXP",
    note: "Work account",
    favorite: true,
    tags: ["work"],
    customFields: [{ type: "secret", title: "Recovery code", value: "a1b2" }],
  },
  card: {
    type: "card",
    title: "Visa",
    cardholderName: "Lin Park",
    number: "4111 1111 1111 1111",
    expiry: "09/29",
    securityCode: "123",
    pin: "0000",
  },
  identity: {
    type: "identity",
    title: "Me",
    firstName: "Lin",
    lastName: "Park",
    email: "lin@example.com",
    phone: "+49 30 123456",
    birthDate: "1990-04-01",
    street: "Hauptstr. 1",
    postalCode: "10115",
    city: "Berlin",
    country: "DE",
  },
  note: { type: "note", title: "Door code", note: "1234#" },
  ssh_key: {
    type: "ssh_key",
    title: "MacBook",
    privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----",
    publicKey: "ssh-ed25519 AAAA… lin@mac",
    passphrase: "correct horse",
  },
  api_key: {
    type: "api_key",
    title: "Stripe",
    keyId: "pk_live_1",
    secret: "sk_live_1",
    host: "api.stripe.com",
  },
  wifi: {
    type: "wifi",
    title: "Home",
    ssid: "FRITZ!Box",
    password: "s3cret",
    security: "wpa2",
    hidden: false,
  },
};

describe("recordDataSchema", () => {
  it("covers every record type", () => {
    expect(Object.keys(RECORDS).toSorted()).toEqual([...RECORD_TYPES].toSorted());
  });

  it.each(Object.entries(RECORDS))("round-trips a %s record through JSON", (_type, record) => {
    const payload: RecordPayload = { schemaVersion: CURRENT_SCHEMA_VERSION, ...record };
    const decoded = upgradeRecordPayload(JSON.parse(JSON.stringify(payload)));

    expect(decoded).toEqual(payload);
    expect(recordDataSchema.parse(decoded)).toEqual(record);
  });

  it("rejects a record without a type", () => {
    expect(recordDataSchema.safeParse({ title: "Untyped" }).success).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(recordDataSchema.safeParse({ type: "bitcoin_wallet", title: "x" }).success).toBe(false);
  });

  it("checks the fields of the given type only", () => {
    expect(recordDataSchema.safeParse({ type: "wifi", title: "x", security: "open" }).success).toBe(
      false,
    );
  });

  it("requires a title on every type", () => {
    for (const type of RECORD_TYPES) {
      expect(recordDataSchema.safeParse({ type, title: "" }).success).toBe(false);
    }
  });

  it("keeps attachments empty until attachments exist", () => {
    expect(recordDataSchema.safeParse({ ...MIN_LOGIN, attachments: [] }).success).toBe(true);
    expect(recordDataSchema.safeParse({ ...MIN_LOGIN, attachments: [{}] }).success).toBe(false);
  });
});

describe("isRecordType", () => {
  it("narrows to the given type", () => {
    const record: RecordData = RECORDS.login;
    expect(isRecordType(record, "login") && record.username).toBe("octo");
    expect(isRecordType(record, "card")).toBe(false);
  });
});

describe("upgradeRecordPayload", () => {
  it("returns a current payload unchanged", () => {
    const payload = { schemaVersion: CURRENT_SCHEMA_VERSION, ...MIN_LOGIN };
    expect(upgradeRecordPayload(payload)).toBe(payload);
  });

  it.each([
    ["a newer version", { schemaVersion: CURRENT_SCHEMA_VERSION + 1, ...MIN_LOGIN }],
    ["no version", MIN_LOGIN],
    ["no object", null],
  ])("rejects %s", (_label, payload) => {
    expect(() => upgradeRecordPayload(payload)).toThrow(UnsupportedSchemaVersionError);
  });

  it.each([
    ["no type", { schemaVersion: CURRENT_SCHEMA_VERSION, title: "Untyped" }],
    ["an unknown type", { schemaVersion: CURRENT_SCHEMA_VERSION, type: "wallet", title: "x" }],
    [
      "a type that is an inherited property name",
      { schemaVersion: 1, type: "toString", title: "x" },
    ],
  ])("rejects a payload with %s", (_label, payload) => {
    expect(() => upgradeRecordPayload(payload)).toThrow(UnknownRecordTypeError);
  });
});

describe("loginRecordSchema websites (empty string OR valid URL)", () => {
  it("accepts entries with empty-string value", () => {
    expect(() =>
      loginRecordSchema.parse({ ...MIN_LOGIN, websites: [{ value: "" }] }),
    ).not.toThrow();
  });

  it("accepts entries with a valid URL", () => {
    expect(() =>
      loginRecordSchema.parse({ ...MIN_LOGIN, websites: [{ value: "https://example.com" }] }),
    ).not.toThrow();
  });

  it("rejects entries with a non-empty, non-URL string", () => {
    expect(() =>
      loginRecordSchema.parse({ ...MIN_LOGIN, websites: [{ value: "not a url" }] }),
    ).toThrow();
  });
});

describe("seed data", () => {
  it.each(exampleLoginRecords.map((r) => [r.title, r] as const))(
    "%s is a valid login record",
    (_title, record) => {
      expect(recordDataSchema.parse(record)).toEqual(record);
    },
  );

  it("edge cases all carry the login type", () => {
    expect(edgeCaseLoginRecords.every((record) => record.type === "login")).toBe(true);
  });
});
