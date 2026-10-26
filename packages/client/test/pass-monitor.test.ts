import type { DecryptedRecord } from "@repo/schema";
import type { PasswordStrength } from "@repo/util";
import { describe, expect, it } from "vitest";
import {
  findDuplicateLogins,
  findInsecureWebsites,
  findMissingTwoFactor,
  findOldPasswords,
  findReusedPasswords,
  passMonitorIssueCount,
  passwordLastChangedLabel,
  type RateStrength,
  sortWeakPasswords,
  weakPasswordOf,
} from "../src/records/pass-monitor";
import { loadTwoFactorDirectory, twoFactorSiteOf } from "../src/records/two-factor-directory";

function record(recordId: string, fields: Record<string, unknown> = {}): DecryptedRecord {
  return {
    recordId,
    vaultId: "personal",
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

const site = (...urls: string[]) => ({ websites: urls.map((value) => ({ value })) });
const ids = (records: DecryptedRecord[]) => records.map((r) => r.recordId);

describe("findReusedPasswords", () => {
  it("groups exact matches across vaults and Wi-Fi, never empty or other types' secrets", () => {
    const groups = findReusedPasswords([
      record("a", { password: "hunter2" }),
      record("b", { password: "hunter2", vaultId: "work" }),
      record("c", { type: "wifi", password: "hunter2" }),
      record("d", { password: "Hunter2" }),
      record("e", { password: "" }),
      record("f", { password: "" }),
      record("g", { type: "card", pin: "hunter2" }),
    ]);

    expect(groups.map((g) => ids(g.records))).toEqual([["a", "b", "c"]]);
    expect(groups[0]!.id).toBe("a");
  });

  it("lists bigger groups first", () => {
    const groups = findReusedPasswords([
      record("a", { password: "one" }),
      record("b", { password: "one" }),
      record("c", { password: "two" }),
      record("d", { password: "two" }),
      record("e", { password: "two" }),
    ]);

    expect(groups.map((g) => ids(g.records))).toEqual([
      ["c", "d", "e"],
      ["a", "b"],
    ]);
  });
});

describe("findDuplicateLogins", () => {
  it("matches the username case-insensitively on the same host, whatever the scheme or path", () => {
    const groups = findDuplicateLogins([
      record("a", { username: "Jana ", ...site("https://www.github.com/login") }),
      record("b", { username: "jana", vaultId: "work", ...site("github.com:443") }),
      record("c", { username: "bob", ...site("https://github.com") }),
      record("d", { username: "jana", ...site("https://gist.github.com") }),
    ]);

    expect(groups.map((g) => ids(g.records))).toEqual([["a", "b"]]);
  });

  it("takes the email as the account of a login without a username", () => {
    const groups = findDuplicateLogins([
      record("a", { email: "jana@example.com", ...site("https://github.com") }),
      record("b", { email: "Jana@example.com", ...site("https://github.com") }),
      record("c", { username: "jana", email: "jana@example.com", ...site("https://github.com") }),
    ]);

    expect(groups.map((g) => ids(g.records))).toEqual([["a", "b"]]);
  });

  it("chains logins that share a host with different members", () => {
    const groups = findDuplicateLogins([
      record("a", { username: "jana", ...site("a.com") }),
      record("b", { username: "jana", ...site("a.com", "b.com") }),
      record("c", { username: "jana", ...site("b.com") }),
    ]);

    expect(groups.map((g) => ids(g.records))).toEqual([["a", "b", "c"]]);
  });

  it("ignores logins without a website or username, and other types", () => {
    const groups = findDuplicateLogins([
      record("a", { username: "jana" }),
      record("b", { username: "jana" }),
      record("e", site("github.com")),
      record("f", { username: " ", ...site("github.com") }),
      record("c", { type: "wifi", ssid: "home" }),
      record("d", { type: "wifi", ssid: "home" }),
    ]);

    expect(groups).toEqual([]);
  });

  it("matches no host for app ids and other schemes", () => {
    const groups = findDuplicateLogins([
      record("a", { username: "jana", ...site("androidapp://com.github.android") }),
      record("b", { username: "jana", ...site("androidapp://com.github.android") }),
      record("c", { username: "jana", ...site("ssh://github.com") }),
      record("d", { username: "jana", ...site("ssh://github.com") }),
    ]);

    expect(groups).toEqual([]);
  });
});

describe("findOldPasswords", () => {
  const now = new Date("2026-10-12T00:00:00.000Z");

  it("dates by passwordChangedAt, else the first version, oldest first", () => {
    const old = findOldPasswords(
      [
        record("recent", { password: "x", passwordChangedAt: "2026-06-01T00:00:00.000Z" }),
        record("stamped", { password: "x", passwordChangedAt: "2024-10-01T00:00:00.000Z" }),
        record("created", { password: "x", firstCreatedAt: "2025-10-12T00:00:00.000Z" }),
        record("no-password", { firstCreatedAt: "2020-01-01T00:00:00.000Z" }),
        record("undated", { password: "x" }),
      ],
      now,
    );

    expect(old.map((o) => [o.record.recordId, o.ageDays])).toEqual([
      ["stamped", 741],
      ["created", 365],
    ]);
    expect(old.map((o) => passwordLastChangedLabel(o.ageDays))).toEqual([
      "Last changed 2 years ago",
      "Last changed 12 months ago",
    ]);
  });
});

describe("passwordLastChangedLabel", () => {
  it("counts months under two years, whole years after", () => {
    expect(passwordLastChangedLabel(365)).toBe("Last changed 12 months ago");
    expect(passwordLastChangedLabel(425)).toBe("Last changed 14 months ago");
    expect(passwordLastChangedLabel(729)).toBe("Last changed 2 years ago");
    expect(passwordLastChangedLabel(741)).toBe("Last changed 2 years ago");
    expect(passwordLastChangedLabel(1200)).toBe("Last changed 3 years ago");
  });
});

describe("weakPasswordOf", () => {
  const level = (value: PasswordStrength["level"]): PasswordStrength => ({
    level: value,
    label: value,
  });

  it("flags weak and fair ratings, with the record's own words as known inputs", () => {
    const seen: string[][] = [];
    const rate: RateStrength = (password, inputs) => {
      seen.push(inputs);
      return level(password === "ok" ? "strong" : password === "meh" ? "fair" : "weak");
    };

    const weak = weakPasswordOf(
      record("GitHub", { username: "jana", password: "bad", ...site("https://github.com") }),
      rate,
    );
    const fair = weakPasswordOf(record("b", { password: "meh" }), rate);
    const strong = weakPasswordOf(record("c", { password: "ok" }), rate);

    expect(weak?.strength.level).toBe("weak");
    expect(fair?.strength.level).toBe("fair");
    expect(strong).toBeUndefined();
    expect(seen[0]).toEqual(["GitHub", "jana", "github.com"]);
    expect(sortWeakPasswords([fair!, weak!]).map((f) => f.record.recordId)).toEqual([
      "GitHub",
      "b",
    ]);
  });

  it("skips records without a password and unrated ones", () => {
    expect(weakPasswordOf(record("a"), () => level("weak"))).toBeUndefined();
    expect(weakPasswordOf(record("b", { password: "x" }), () => null)).toBeUndefined();
  });
});

describe("findInsecureWebsites", () => {
  it("flags logins with a plain http:// website, never loopback or schemeless ones", () => {
    const found = findInsecureWebsites([
      record("b", site("http://router.example", "HTTP://router.example/admin")),
      record("a", site("https://secure.example", "http://192.168.1.1")),
      record("c", site("https://secure.example", "example.com")),
      record("d", site("http://localhost:3000", "http://127.0.0.1")),
      record("e", { type: "wifi", ...site("http://wifi.example") }),
    ]);

    expect(found.map(({ record, hosts }) => [record.recordId, hosts])).toEqual([
      ["a", ["192.168.1.1"]],
      ["b", ["router.example"]],
    ]);
  });
});

describe("twoFactorSiteOf", () => {
  const directory = new Map([
    ["example.com", "https://example.com/2fa"],
    ["chat.other.com", ""],
  ]);

  it("matches the host or a domain above it, never a bare suffix or a sibling", () => {
    expect(twoFactorSiteOf("login.example.com", directory)).toEqual({
      domain: "example.com",
      documentation: "https://example.com/2fa",
    });
    expect(twoFactorSiteOf("chat.other.com", directory)).toEqual({ domain: "chat.other.com" });
    expect(twoFactorSiteOf("mail.other.com", directory)).toBeUndefined();
    expect(twoFactorSiteOf("com", new Map([["com", ""]]))).toBeUndefined();
  });

  it("finds well-known sites in the bundled snapshot", async () => {
    const bundled = await loadTwoFactorDirectory();
    expect(twoFactorSiteOf("github.com", bundled)?.documentation).toMatch(/^https:\/\//);
  });
});

describe("findMissingTwoFactor", () => {
  const directory = new Map([["example.com", ""]]);

  it("lists logins with a password for a 2FA site and no TOTP secret", () => {
    const found = findMissingTwoFactor(
      [
        record("b", { password: "x", ...site("https://www.example.com") }),
        record("a", { password: "x", ...site("https://nope.test", "app.example.com") }),
        record("c", { password: "x", totp: "otpauth://totp/x", ...site("example.com") }),
        record("d", { password: "", ...site("example.com") }),
        record("e", { password: "x", ...site("nope.test") }),
        record("f", { type: "wifi", password: "x", ...site("example.com") }),
      ],
      directory,
    );

    expect(found.map(({ record, site }) => [record.recordId, site.domain])).toEqual([
      ["a", "example.com"],
      ["b", "example.com"],
    ]);
  });
});

describe("passMonitorIssueCount", () => {
  it("adds up the overview's counts, duplicates aside, unknown checks as nothing", () => {
    const a = record("a");
    const b = record("b");
    expect(
      passMonitorIssueCount({
        weak: [a],
        reused: [{ id: "a", records: [a, b] }],
        old: [b],
        insecure: [],
        missingTwoFactor: null,
        breached: [a],
      }),
    ).toBe(5);
  });
});
