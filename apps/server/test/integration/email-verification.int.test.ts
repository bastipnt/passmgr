import { hashEmail } from "@repo/crypto";
import { db, usersTable } from "@repo/db";
import { EMAIL_CODE_EXPIRED, EMAIL_CODE_INVALID, EMAIL_UNVERIFIED } from "@repo/schema";
import { toBase64 } from "@repo/util";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DevMailer, setMailer } from "../../src/mail/mailer";
import { serverKey } from "../../src/opaque";
import { redis } from "../../src/redis";
import {
  purgeUnverifiedAccounts,
  UNVERIFIED_ACCOUNT_MAX_AGE_MS,
} from "../../src/user/email-verification";
import { truncateAll } from "../setup/db-helpers";
import { buildTestContext } from "../setup/test-context";
import { callSigned, createCaller, loginAndGetAuthKey, register } from "./_helpers";

const password = "correct horse battery staple";
const email = "alice@example.com";
let mailer: DevMailer;

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
  mailer = new DevMailer();
  setMailer(mailer);
});

afterEach(() => setMailer(null));

function sentCode(to = email): string {
  const code = mailer.latest(to)?.text.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error(`no code mailed to ${to}`);
  return code;
}

async function signedIn(as = email) {
  const { sessionId, authKey } = await loginAndGetAuthKey(as, password);
  return {
    sync: async () => {
      const input = { cursors: {} };
      return (await callSigned(sessionId, authKey, "query", "record.sync", input)).record.sync(
        input,
      );
    },
    status: async () =>
      (
        await callSigned(sessionId, authKey, "query", "user.emailVerificationStatus", undefined)
      ).user.emailVerificationStatus(),
    resend: async () =>
      (
        await callSigned(sessionId, authKey, "mutation", "user.sendVerificationCode", undefined)
      ).user.sendVerificationCode(),
    verify: async (code: string) => {
      const input = { code };
      return (
        await callSigned(sessionId, authKey, "mutation", "user.verifyEmail", input)
      ).user.verifyEmail(input);
    },
    invitations: async () =>
      (
        await callSigned(sessionId, authKey, "query", "vault.invitations", undefined)
      ).vault.invitations(),
    publicKey: async (of: string) => {
      const input = { email: of };
      return (
        await callSigned(sessionId, authKey, "query", "user.publicKey", input)
      ).user.publicKey(input);
    },
  };
}

describe("email verification (real Postgres + Redis)", () => {
  it("mails a code at registration; sync is refused until it is entered", async () => {
    await register(email, password);
    const alice = await signedIn();

    expect(await alice.status()).toEqual({ verified: false });
    await expect(alice.sync()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: EMAIL_UNVERIFIED,
    });

    await alice.verify(sentCode());
    expect(await alice.status()).toEqual({ verified: true });
    await expect(alice.sync()).resolves.toMatchObject({ hasMore: false });
  });

  it("counts an account as verified at once when there is no mailer", async () => {
    setMailer(null);
    await register(email, password);
    const alice = await signedIn();

    expect(await alice.status()).toEqual({ verified: true });
    await expect(alice.sync()).resolves.toBeDefined();
    const config = await createCaller(buildTestContext(undefined)).appConfig.getConfig();
    expect(config.emailVerification).toBe(false);
  });

  it("burns the code after five wrong guesses", async () => {
    await register(email, password);
    const alice = await signedIn();
    const code = sentCode();
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 4; i++) {
      await expect(alice.verify(wrong)).rejects.toMatchObject({ message: EMAIL_CODE_INVALID });
    }
    await expect(alice.verify(wrong)).rejects.toMatchObject({ message: EMAIL_CODE_INVALID });
    await expect(alice.verify(code)).rejects.toMatchObject({ message: EMAIL_CODE_EXPIRED });
  });

  it("limits resends and replaces the earlier code", async () => {
    await register(email, password);
    const alice = await signedIn();
    const first = sentCode();

    await expect(alice.resend()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    await redis.del(`emailcode:cooldown:${await userId(email)}`);
    await alice.resend();
    const second = sentCode();
    if (first !== second) {
      await expect(alice.verify(first)).rejects.toMatchObject({ message: EMAIL_CODE_INVALID });
    }
    await alice.verify(second);
  });

  it("caps sends at five an hour", async () => {
    await register(email, password);
    const alice = await signedIn();
    const id = await userId(email);

    for (let i = 0; i < 4; i++) {
      await redis.del(`emailcode:cooldown:${id}`);
      await alice.resend();
    }
    await redis.del(`emailcode:cooldown:${id}`);
    await expect(alice.resend()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("lets accounts made while the mailer was on sync once it is off", async () => {
    await register(email, password);
    const alice = await signedIn();
    setMailer(null);

    expect(await alice.status()).toEqual({ verified: true });
    await expect(alice.sync()).resolves.toBeDefined();
    expect(await purgeUnverifiedAccounts(Date.now() + 2 * UNVERIFIED_ACCOUNT_MAX_AGE_MS)).toEqual({
      purged: 0,
      failed: 0,
    });
  });

  it("hides unverified accounts from the share lookup", async () => {
    await register(email, password);
    await register("bob@example.com", password);
    const bob = await signedIn("bob@example.com");

    await expect(bob.publicKey(email)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const alice = await signedIn();
    await alice.verify(sentCode());
    await expect(bob.publicKey(email)).resolves.toMatchObject({ keyVersion: 1 });
  });

  it("purges accounts left unverified for a week, nothing else", async () => {
    await register(email, password);
    await register("bob@example.com", password);
    const alice = await signedIn();
    await alice.verify(sentCode());

    const later = Date.now() + UNVERIFIED_ACCOUNT_MAX_AGE_MS + 60_000;
    expect(await purgeUnverifiedAccounts(Date.now())).toEqual({ purged: 0, failed: 0 });
    expect(await purgeUnverifiedAccounts(later)).toEqual({ purged: 1, failed: 0 });

    const left = await db.select({ userId: usersTable.userId }).from(usersTable);
    expect(left).toEqual([{ userId: await userId(email) }]);
  });
});

async function userId(of: string): Promise<string> {
  const emailHash = toBase64(await hashEmail(serverKey, of));
  const [user] = await db
    .select({ userId: usersTable.userId })
    .from(usersTable)
    .where(eq(usersTable.emailHash, emailHash));
  return user!.userId;
}
