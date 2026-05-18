import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as opaque from "@serenity-kit/opaque";
import { db, usersTable } from "@repo/db";
import { encryptEmail, hashEmail } from "@repo/crypto";
import { fromString, toBase64 } from "@repo/util";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { register } from "./_helpers";

beforeAll(async () => {
  await opaque.ready;
});

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("email encryption + uniqueness (real crypto, live constraint)", () => {
  it("encryptEmail produces a fresh nonce + ciphertext on every call (entropy)", async () => {
    const serverKey = fromString(process.env.OPAQUE_SERVER_SETUP!);
    const email = "alice@example.com";
    const [c1, n1, s1] = await encryptEmail(serverKey, email);
    const [c2, n2, s2] = await encryptEmail(serverKey, email);
    expect(c1).not.toBe(c2);
    expect(n1).not.toBe(n2);
    expect(s1).not.toBe(s2);
  });

  it("hashEmail is deterministic across runs (same serverKey + email → same hash)", async () => {
    const serverKey = fromString(process.env.OPAQUE_SERVER_SETUP!);
    const h1 = toBase64(await hashEmail(serverKey, "alice@example.com"));
    const h2 = toBase64(await hashEmail(serverKey, "alice@example.com"));
    expect(h1).toBe(h2);
    const h3 = toBase64(await hashEmail(serverKey, "bob@example.com"));
    expect(h3).not.toBe(h1);
  });

  it("registering the same email twice leaves exactly one users row (emailHash unique)", async () => {
    await register("dupe@example.com", "first-password");
    await register("dupe@example.com", "second-password").catch(() => undefined);

    const users = await db.select().from(usersTable);
    expect(users).toHaveLength(1);
  });

  it("two distinct registrations write distinct encryptedEmail + emailNonce values", async () => {
    await register("alice@example.com", "pw-a");
    await register("bob@example.com", "pw-b");

    const users = await db.select().from(usersTable);
    expect(users).toHaveLength(2);
    const [u1, u2] = users;
    expect(u1!.encryptedEmail).not.toBe(u2!.encryptedEmail);
    expect(u1!.emailNonce).not.toBe(u2!.emailNonce);
    expect(u1!.emailHash).not.toBe(u2!.emailHash);
    expect(u1!.emailEncryptionKeySalt).not.toBe(u2!.emailEncryptionKeySalt);
  });

  it("direct DB insert with a duplicate emailHash raises a unique-constraint violation", async () => {
    await register("alice@example.com", "pw-a");
    const serverKey = fromString(process.env.OPAQUE_SERVER_SETUP!);
    const emailHash = toBase64(await hashEmail(serverKey, "alice@example.com"));
    const [encryptedEmail, emailNonce, emailEncryptionKeySalt] = await encryptEmail(
      serverKey,
      "alice@example.com",
    );

    await expect(
      db.insert(usersTable).values({
        encryptedEmail,
        emailNonce,
        emailEncryptionKeySalt,
        emailHash,
        registrationRecord: "duplicate-marker",
      }),
    ).rejects.toThrow();
  });
});
