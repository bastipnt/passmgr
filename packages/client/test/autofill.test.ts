import type { DecryptedRecord } from "@repo/schema";
import type { PendingAutofillLogin } from "@repo/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportEntry } from "../src/export/import-export";
import {
  autofillEntries,
  importPendingAutofillLogins,
  pendingLoginData,
} from "../src/records/autofill";
import type { RecordRepository } from "../src/records/record-repository";

const native = vi.hoisted(() => ({
  pending: [] as PendingAutofillLogin[],
  removed: [] as (readonly string[] | undefined)[],
}));

vi.mock("@repo/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/store")>()),
  hasPendingAutofillLogins: async () => native.pending.length > 0,
  readPendingAutofillLogins: async () => native.pending,
  removePendingAutofillLogins: async (_profileId: string, ids?: readonly string[]) => {
    native.removed.push(ids);
  },
}));

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

function pendingLogin(fields: Partial<PendingAutofillLogin> = {}): PendingAutofillLogin {
  return {
    id: "6f1c2a3b-0d4e-4f5a-8b6c-7d8e9f0a1b2c",
    title: "github.com",
    website: "https://github.com",
    username: "octo",
    password: "pw-1",
    createdAt: "2026-10-18T10:00:00.000Z",
    ...fields,
  };
}

describe("pendingLoginData", () => {
  it("makes a login with the website, the password dated when it was created", () => {
    expect(pendingLoginData(pendingLogin())).toEqual({
      type: "login",
      title: "github.com",
      username: "octo",
      password: "pw-1",
      passwordChangedAt: "2026-10-18T10:00:00.000Z",
      websites: [{ value: "https://github.com" }],
    });
  });

  it("titles a login without a title by its host, keeps an app id, drops no username", () => {
    expect(pendingLoginData(pendingLogin({ title: " ", username: "" }))).toMatchObject({
      title: "github.com",
      username: undefined,
    });
    expect(
      pendingLoginData(pendingLogin({ title: "Bank", website: "androidapp://com.bank.app" })),
    ).toMatchObject({ title: "Bank", websites: [{ value: "androidapp://com.bank.app" }] });
  });

  it("leaves out a website that isn't one, cuts an over-long title, refuses an over-long password", () => {
    expect(pendingLoginData(pendingLogin({ website: "not a site" }))?.websites).toBeUndefined();
    expect(pendingLoginData(pendingLogin({ title: "", website: "" }))?.title).toBe("Login");
    expect(pendingLoginData(pendingLogin({ title: "t".repeat(1000) }))?.title).toHaveLength(256);
    expect(pendingLoginData(pendingLogin({ password: "x".repeat(100_000) }))).toBeUndefined();
  });
});

describe("importPendingAutofillLogins", () => {
  let written: ImportEntry[];
  let heads: string[];
  const records = {
    heads: async () => heads.map((recordId) => ({ recordId, vaultId: "v", deleted: false })),
    writeImport: async (entries: readonly ImportEntry[]) => {
      written.push(...entries);
      return [];
    },
  } as unknown as RecordRepository;

  beforeEach(() => {
    native.pending = [];
    native.removed = [];
    written = [];
    heads = [];
  });

  it("does nothing, and asks for nothing, without pending logins", async () => {
    expect(await importPendingAutofillLogins(records, "profile", "vault")).toBe(0);
    expect(native.removed).toEqual([]);
  });

  it("creates each in the vault under its own id, then removes them all", async () => {
    const other = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
    native.pending = [pendingLogin(), pendingLogin({ id: other.toUpperCase(), title: "Two" })];

    expect(await importPendingAutofillLogins(records, "profile", "vault")).toBe(2);
    expect(written.map(({ kind, recordId, vaultId }) => [kind, recordId, vaultId])).toEqual([
      ["create", pendingLogin().id, "vault"],
      ["create", other, "vault"],
    ]);
    expect(native.removed).toEqual([[pendingLogin().id, other.toUpperCase()]]);
  });

  it("skips one already saved (a run that stopped before removing it) and an invalid one", async () => {
    heads = [pendingLogin().id];
    native.pending = [
      pendingLogin(),
      pendingLogin({ id: "1a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", password: "x".repeat(100_000) }),
    ];
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await importPendingAutofillLogins(records, "profile", "vault")).toBe(0);
    expect(written).toEqual([]);
    expect(native.removed).toHaveLength(1);
  });
});
