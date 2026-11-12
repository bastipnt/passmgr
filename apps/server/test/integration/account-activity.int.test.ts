import {
  ACCOUNT_EVENT_DEVICE_AAD,
  genKey,
  openAnonymousSeal,
  unwrapUserPrivateKey,
} from "@repo/crypto";
import { accountEventsTable, db, usersTable } from "@repo/db";
import { ACCOUNT_EVENTS_PAGE_SIZE } from "@repo/schema";
import { toBase64 } from "@repo/util";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import {
  ACCOUNT_EVENTS_MAX,
  ACCOUNT_EVENTS_MAX_AGE_MS,
  ACCOUNT_FAILURES_MAX,
  recordAccountEvent,
} from "../../src/user/account-events";
import { truncateAll } from "../setup/db-helpers";
import { clientStartLogin } from "../setup/opaque-client";
import { buildTestContext } from "../setup/test-context";
import { callSigned, createCaller, loginAndGetAuthKey, register } from "./_helpers";

const email = "alice@example.com";
const password = "correct horse battery staple";

type Session = Awaited<ReturnType<typeof loginAndGetAuthKey>>;

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

let accountKey: Uint8Array;

async function registerAlice() {
  ({ accountKey } = await register(email, password));
}

/** One page, the device names opened with the user's private key (as the client does). */
async function listActivity(session: Session, before?: number) {
  const input = before === undefined ? {} : { before };
  const caller = await callSigned(
    session.sessionId,
    session.authKey,
    "query",
    "activity.list",
    input,
  );
  const page = await caller.activity.list(input);
  const privateKey = unwrapUserPrivateKey(accountKey, session.userKeyPair);
  const events = await Promise.all(
    page.events.map(async ({ sealedDeviceName, deviceKeyVersion, ...event }) => ({
      ...event,
      deviceName:
        sealedDeviceName === null
          ? null
          : new TextDecoder().decode(
              await openAnonymousSeal(privateKey, sealedDeviceName, ACCOUNT_EVENT_DEVICE_AAD),
            ),
      deviceKeyVersion,
    })),
  );
  return { ...page, events };
}

async function userId() {
  const [user] = await db.select({ userId: usersTable.userId }).from(usersTable);
  return user!.userId;
}

async function failLogin(wrongPassword: string, deviceName: string) {
  const caller = createCaller(buildTestContext(undefined));
  const started = await clientStartLogin(wrongPassword, email);
  const { loginResponse, attemptId } = await caller.login.startLogin({
    email,
    startLoginRequest: started.startLoginRequest,
  });
  const result = await started.finish(loginResponse);
  // OPAQUE may already fail on the client: then the server never hears of it.
  if (!result) return false;
  await expect(
    createCaller(buildTestContext(undefined, deviceName)).login.finishLogin({
      email,
      attemptId,
      finishLoginRequest: result.finishLoginRequest,
      authSalt: toBase64(genKey()),
    }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  return true;
}

describe("account activity", () => {
  it("lists logins newest first, flags a device name seen for the first time", async () => {
    await registerAlice();
    await loginAndGetAuthKey(email, password, "Firefox on Linux");
    await loginAndGetAuthKey(email, password, "Firefox on Linux");
    const session = await loginAndGetAuthKey(email, password, "Safari on iOS");

    const { events, nextBefore } = await listActivity(session);
    expect(nextBefore).toBeNull();
    expect(events.map((e) => [e.type, e.deviceName, e.newDevice])).toEqual([
      ["login", "Safari on iOS", true],
      ["login", "Firefox on Linux", false],
      ["login", "Firefox on Linux", true],
      ["account_created", null, false],
    ]);
    const stored = JSON.stringify(await db.select().from(accountEventsTable));
    expect(stored).not.toContain("Firefox");
    expect(stored).not.toContain("Safari");
  });

  it("records a wrong password and a signed-out device, never another user's events", async () => {
    await registerAlice();
    await register("bob@example.com", password);
    await loginAndGetAuthKey("bob@example.com", password, "Bob's phone");
    const failed = await failLogin("WRONG-PASSWORD", "Unknown laptop");
    // Written without awaiting (no timing difference to an unknown email).
    if (failed)
      await expect.poll(async () => (await db.select().from(accountEventsTable)).length).toBe(4);
    const other = await loginAndGetAuthKey(email, password, "Old laptop");
    const session = await loginAndGetAuthKey(email, password, "Desktop");

    const caller = await callSigned(
      session.sessionId,
      session.authKey,
      "query",
      "session.list",
      undefined,
    );
    const target = (await caller.session.list()).find((s) => !s.current)!;
    const revoke = await callSigned(
      session.sessionId,
      session.authKey,
      "mutation",
      "session.revoke",
      {
        id: target.id,
      },
    );
    await revoke.session.revoke({ id: target.id });
    expect(other.sessionId).toBeDefined();

    const types = (await listActivity(session)).events.map((e) => [e.type, e.deviceName]);
    expect(types[0]).toEqual(["session_revoked", "Old laptop"]);
    if (failed) expect(types).toContainEqual(["login_failed", "Unknown laptop"]);
    expect(types.some(([, device]) => device === "Bob's phone")).toBe(false);
  });

  it("doesn't flag the device the account was created or recovered on", async () => {
    await registerAlice();
    const id = await userId();
    await recordAccountEvent(id, "account_created", { deviceName: "Firefox on Linux" });
    await recordAccountEvent(id, "account_recovered", { deviceName: "Safari on iOS" });
    await loginAndGetAuthKey(email, password, "Safari on iOS");
    const session = await loginAndGetAuthKey(email, password, "Firefox on Linux");

    const logins = (await listActivity(session)).events.filter((e) => e.type === "login");
    expect(logins.map((e) => e.newDevice)).toEqual([false, false]);
  });

  it("keeps failed sign-ins apart, so they can't push the owner's events out", async () => {
    await registerAlice();
    const id = await userId();
    for (let i = 0; i < ACCOUNT_FAILURES_MAX + 10; i++) {
      await recordAccountEvent(id, "login_failed", { deviceName: "Attacker" });
    }

    const rows = await db
      .select({ type: accountEventsTable.type })
      .from(accountEventsTable)
      .where(eq(accountEventsTable.userId, id));
    expect(rows.filter((r) => r.type === "login_failed")).toHaveLength(ACCOUNT_FAILURES_MAX);
    expect(rows.some((r) => r.type === "account_created")).toBe(true);
  });

  it("pages by id", async () => {
    await registerAlice();
    const id = await userId();
    for (let i = 0; i < ACCOUNT_EVENTS_PAGE_SIZE + 5; i++) {
      await recordAccountEvent(id, "email_verified");
    }
    const session = await loginAndGetAuthKey(email, password);

    const first = await listActivity(session);
    expect(first.events).toHaveLength(ACCOUNT_EVENTS_PAGE_SIZE);
    expect(first.nextBefore).toBe(first.events.at(-1)!.id);
    const second = await listActivity(session, first.nextBefore!);
    expect(second.nextBefore).toBeNull();
    expect(first.events.length + second.events.length).toBe(ACCOUNT_EVENTS_PAGE_SIZE + 7);
    expect(Math.max(...second.events.map((e) => e.id))).toBeLessThan(first.nextBefore!);
  });

  it("keeps the newest ACCOUNT_EVENTS_MAX events", async () => {
    await registerAlice();
    const id = await userId();
    await db.execute(
      sql`INSERT INTO account_events ("userId", type) SELECT ${id}, 'email_verified' FROM generate_series(1, ${ACCOUNT_EVENTS_MAX})`,
    );
    await recordAccountEvent(id, "password_changed");

    const rows = await db
      .select({ type: accountEventsTable.type })
      .from(accountEventsTable)
      .where(eq(accountEventsTable.userId, id));
    expect(rows).toHaveLength(ACCOUNT_EVENTS_MAX);
    expect(rows.some((r) => r.type === "password_changed")).toBe(true);
    expect(rows.some((r) => r.type === "account_created")).toBe(false);
  });

  it("drops events past the max age", async () => {
    await registerAlice();
    const id = await userId();
    await db.insert(accountEventsTable).values({
      userId: id,
      type: "login",
      created_at: new Date(Date.now() - ACCOUNT_EVENTS_MAX_AGE_MS - 60_000),
    });
    await recordAccountEvent(id, "password_changed");

    const rows = await db
      .select({ type: accountEventsTable.type })
      .from(accountEventsTable)
      .where(eq(accountEventsTable.userId, id));
    expect(rows.map((r) => r.type).sort()).toEqual(["account_created", "password_changed"]);
  });

  it("is gone with the account", async () => {
    await registerAlice();
    const session = await loginAndGetAuthKey(email, password);
    const caller = await callSigned(
      session.sessionId,
      session.authKey,
      "mutation",
      "user.deleteAccount",
      undefined,
    );
    await caller.user.deleteAccount();
    expect(await db.select().from(accountEventsTable)).toEqual([]);
  });
});
