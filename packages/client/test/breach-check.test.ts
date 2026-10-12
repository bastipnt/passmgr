import { pwnedPasswordHash } from "@repo/crypto";
import type { DecryptedRecord } from "@repo/schema";
import { type BreachCheck, breachCheckKey } from "@repo/store";
import { describe, expect, it, vi } from "vitest";
import {
  breachCountLabel,
  breachVersion,
  countBreaches,
  findBreachedPasswords,
  isBreachCheckStale,
  parseRangeResponse,
  RangeRequestError,
} from "../src/records/breach-check";

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

const keyOf = (r: DecryptedRecord) => breachCheckKey(breachVersion(r));

function rangeOf(...passwords: [string, number][]) {
  return passwords
    .map(([password, count]) => `${pwnedPasswordHash(password).suffix}:${count}`)
    .join("\r\n");
}

describe("parseRangeResponse", () => {
  it("reads suffix:count lines and skips padding rows", () => {
    const counts = parseRangeResponse(
      "0018A45C4D1DEF81644B54AB7F969B88D65:10\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:0\r\n\r\n",
    );
    expect([...counts]).toEqual([["0018A45C4D1DEF81644B54AB7F969B88D65", 10]]);
  });
});

describe("countBreaches", () => {
  it("sends one request per hash prefix, only the prefix, and counts per record version", async () => {
    const a = record("a", { password: "password" });
    const b = record("b", { password: "password", vaultId: "work" });
    const c = record("c", { type: "wifi", password: "correct horse" });
    const d = record("d", { type: "note", password: "password" });
    const fetchRange = vi.fn(async (prefix: string) =>
      prefix === pwnedPasswordHash("password").prefix ? rangeOf(["password", 42]) : rangeOf(),
    );

    const counts = await countBreaches([a, b, c, d], { fetchRange });

    expect(fetchRange.mock.calls.map(([prefix]) => prefix).sort()).toEqual(
      [pwnedPasswordHash("password").prefix, pwnedPasswordHash("correct horse").prefix].sort(),
    );
    expect(counts).toEqual(
      new Map([
        [keyOf(a), 42],
        [keyOf(b), 42],
        [keyOf(c), 0],
      ]),
    );
  });

  it("retries a rate-limited prefix and leaves a failing one out", async () => {
    const a = record("a", { password: "password" });
    const b = record("b", { password: "letmein" });
    let limited = true;
    const fetchRange = vi.fn(async (prefix: string) => {
      if (prefix === pwnedPasswordHash("letmein").prefix) throw new RangeRequestError(500);
      if (limited) {
        limited = false;
        throw new RangeRequestError(429, 1);
      }
      return rangeOf(["password", 7]);
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const counts = await countBreaches([a, b], { fetchRange });

    expect(counts).toEqual(new Map([[keyOf(a), 7]]));
  });

  it("rejects when aborted", async () => {
    const controller = new AbortController();
    const fetchRange = vi.fn(async () => {
      controller.abort();
      throw new Error("aborted");
    });

    await expect(
      countBreaches([record("a", { password: "x" })], { fetchRange, signal: controller.signal }),
    ).rejects.toBeDefined();
  });
});

describe("findBreachedPasswords", () => {
  const check = (r: DecryptedRecord, count: number): [string, BreachCheck] => [
    keyOf(r),
    { ...breachVersion(r), vaultId: r.vaultId, count, checkedAt: "2026-10-01T00:00:00.000Z" },
  ];

  it("lists breached current passwords, most often seen first, then by title", () => {
    const a = record("a", { password: "1", title: "Zeta" });
    const b = record("b", { password: "2", title: "Alpha" });
    const c = record("c", { password: "3", title: "Beta" });
    const clean = record("d", { password: "4" });
    const edited = record("e", { password: "5", version: 2 });
    const checks = new Map([
      check(a, 5),
      check(b, 5),
      check(c, 900),
      check(clean, 0),
      check({ ...edited, version: 1 } as DecryptedRecord, 3),
    ]);

    const found = findBreachedPasswords([a, b, c, clean, edited], checks);

    expect(found.map(({ record: r, count }) => [r.recordId, count])).toEqual([
      ["c", 900],
      ["b", 5],
      ["a", 5],
    ]);
  });
});

describe("isBreachCheckStale", () => {
  it("is stale after 30 days", () => {
    const check = { checkedAt: "2026-09-01T00:00:00.000Z" };
    expect(isBreachCheckStale(check, new Date("2026-09-30T23:59:00.000Z"))).toBe(false);
    expect(isBreachCheckStale(check, new Date("2026-10-01T00:00:00.000Z"))).toBe(true);
  });
});

describe("breachCountLabel", () => {
  it("says how often the password was seen", () => {
    expect(breachCountLabel(1)).toBe("Seen 1 time in data breaches");
    expect(breachCountLabel(3861493)).toBe("Seen 3,861,493 times in data breaches");
  });
});
