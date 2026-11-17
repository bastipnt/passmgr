import { hashEmail } from "@repo/crypto";
import { db, usersTable } from "@repo/db";
import {
  EMAIL_CODE_EXPIRED,
  EMAIL_CODE_INVALID,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_UNVERIFIED,
} from "@repo/schema";
import { toBase64 } from "@repo/util";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Mail, type Mailer, setMailer } from "../../src/mail/mailer";
import { serverKey } from "../../src/opaque";
import { redis } from "../../src/redis";
import {
  purgeUnverifiedAccounts,
  UNVERIFIED_ACCOUNT_MAX_AGE_MS,
} from "../../src/user/email-verification";
import { EMAIL_CODE_MAX_TOTAL_ATTEMPTS } from "../../src/util/redis-utils";
import { truncateAll } from "../setup/db-helpers";
import { buildTestContext } from "../setup/test-context";
import { callSigned, createCaller, loginAndGetAuthKey, register } from "./_helpers";

const password = "correct horse battery staple";
const email = "alice@example.com";

class OutboxMailer implements Mailer {
  private readonly outbox = new Map<string, Mail>();

  async send(mail: Mail): Promise<void> {
    this.outbox.set(mail.to, mail);
  }

  latest(to: string): Mail | undefined {
    return this.outbox.get(to);
  }
}

let mailer: OutboxMailer;

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
  mailer = new OutboxMailer();
  setMailer(mailer);
});

afterEach(() => setMailer(null));

// finishRegistration mails without awaiting the send.
async function sentCode(to = email): Promise<string> {
  return await vi.waitFor(() => {
    const code = mailer.latest(to)?.text.match(/\b\d{6}\b/)?.[0];
    if (!code) throw new Error(`no code mailed to ${to}`);
    return code;
  });
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
        await callSigned(sessionId, authKey, "mutation", "user.publicKey", input)
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

    await alice.verify(await sentCode());
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
    const code = await sentCode();
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
    const first = await sentCode();

    await expect(alice.resend()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    await redis.del(`emailcode:cooldown:${await userId(email)}`);
    await alice.resend();
    const second = await sentCode();
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

  it("caps wrong guesses across every code the account is sent", async () => {
    await register(email, password);
    const alice = await signedIn();
    const id = await userId(email);
    const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

    for (let i = 0; i < EMAIL_CODE_MAX_TOTAL_ATTEMPTS / EMAIL_CODE_MAX_ATTEMPTS; i++) {
      const code = await sentCode();
      for (let j = 0; j < EMAIL_CODE_MAX_ATTEMPTS; j++) {
        await expect(alice.verify(wrong(code))).rejects.toMatchObject({
          message: EMAIL_CODE_INVALID,
        });
      }
      await redis.del(`emailcode:cooldown:${id}`, `emailcode:hourly:${id}`);
      if (i < EMAIL_CODE_MAX_TOTAL_ATTEMPTS / EMAIL_CODE_MAX_ATTEMPTS - 1) await alice.resend();
    }

    await expect(alice.resend()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(alice.verify("123456")).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("stops mailing once the server's hourly mail cap is reached", async () => {
    await register(email, password);
    await sentCode();
    await redis.set("mail:hourly", 500, "EX", 3600);
    await register("carol@example.com", password);
    const carol = await signedIn("carol@example.com");

    // A refused send doesn't hold the account's resend cooldown.
    const carolId = await userId("carol@example.com");
    await vi.waitFor(async () => {
      expect(await redis.get(`emailcode:hourly:${carolId}`)).toBe("0");
      expect(await redis.exists(`emailcode:cooldown:${carolId}`)).toBe(0);
    });
    await expect(carol.resend()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mailer.latest("carol@example.com")).toBeUndefined();

    await redis.del("mail:hourly");
    await carol.resend();
    await expect(sentCode("carol@example.com")).resolves.toMatch(/^\d{6}$/);
  });

  it("doesn't count stale or right codes toward the account's attempt cap", async () => {
    await register(email, password);
    const alice = await signedIn();
    const code = await sentCode();
    await redis.del(`emailcode:${await userId(email)}`);

    for (let i = 0; i < EMAIL_CODE_MAX_TOTAL_ATTEMPTS; i++) {
      await expect(alice.verify(code)).rejects.toMatchObject({ message: EMAIL_CODE_EXPIRED });
    }
    await redis.del(`emailcode:cooldown:${await userId(email)}`);
    await alice.resend();
    await alice.verify(await sentCode());
    expect(await alice.status()).toEqual({ verified: true });
  });

  it("answers registration without waiting for the mail", async () => {
    setMailer({ send: () => new Promise<void>(() => {}) });
    await expect(register(email, password)).resolves.toBeDefined();
  });

  it("refuses the share lookup to an unverified account", async () => {
    await register("bob@example.com", password);
    await register(email, password);
    const alice = await signedIn();

    await expect(alice.publicKey("bob@example.com")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: EMAIL_UNVERIFIED,
    });
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
    await bob.verify(await sentCode("bob@example.com"));

    await expect(bob.publicKey(email)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const alice = await signedIn();
    await alice.verify(await sentCode());
    await expect(bob.publicKey(email)).resolves.toMatchObject({ keyVersion: 1 });
  });

  it("purges accounts left unverified for a week, nothing else", async () => {
    await register(email, password);
    await register("bob@example.com", password);
    const alice = await signedIn();
    await alice.verify(await sentCode());

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
