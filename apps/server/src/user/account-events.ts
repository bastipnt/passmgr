import { ACCOUNT_EVENT_DEVICE_AAD, hashDeviceName, sealAnonymous } from "@repo/crypto";
import { accountEventsTable, db, userKeyPairsTable } from "@repo/db";
import {
  ACCOUNT_EVENTS_PAGE_SIZE,
  type AccountEventType,
  type SealedAccountEvent,
} from "@repo/schema";
import { fromString, toBase64 } from "@repo/util";
import { and, desc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { serverKey } from "../opaque";
import { DAY_MS } from "../util/time";

export const ACCOUNT_EVENTS_MAX = 500;
// Failed sign-ins are kept apart: anyone who knows the email can cause them,
// and they must not push the owner's own events out of the log.
export const ACCOUNT_FAILURES_MAX = 50;
export const ACCOUNT_EVENTS_MAX_AGE_MS = 365 * DAY_MS;
// The owner's events are pruned on about one write in this many, so their log can run a few
// past its cap; failures, which anyone can cause, on every write.
export const ACCOUNT_EVENTS_PRUNE_EVERY = 10;

const LOGIN_TYPES: AccountEventType[] = ["login", "device_login"];
// Device names the owner has used: a login from one of them is not "new".
const KNOWN_DEVICE_TYPES: AccountEventType[] = [
  ...LOGIN_TYPES,
  "account_created",
  "account_recovered",
];
export const FAILURE_TYPES: AccountEventType[] = ["login_failed", "second_factor_failed"];

type EventLog = { error: (obj: object, msg: string) => void };

/**
 * Append an event to the user's activity log and keep it within its count
 * (`pruneAccountEvents`; the age limit is the hourly `purgeExpiredAccountEvents`). Best-effort: the action it records already
 * happened, so a failure here is logged, never thrown.
 */
export async function recordAccountEvent(
  userId: string,
  type: AccountEventType,
  { deviceName, log }: { deviceName?: string; log?: EventLog } = {},
): Promise<void> {
  try {
    const device = deviceName === undefined ? undefined : await sealDevice(userId, deviceName);
    const newDevice =
      LOGIN_TYPES.includes(type) &&
      device !== undefined &&
      !(await hasUsedDevice(userId, device.deviceNameHash));
    await db.insert(accountEventsTable).values({ userId, type, ...device, newDevice });
    const failure = FAILURE_TYPES.includes(type);
    if (failure || Math.random() * ACCOUNT_EVENTS_PRUNE_EVERY < 1) {
      await pruneAccountEvents(userId, failure);
    }
  } catch (err) {
    log?.error({ err, type }, "account_event.record_failed");
  }
}

/** The name sealed to the user's current keypair (unreadable for the server), and its hash. */
async function sealDevice(userId: string, deviceName: string) {
  const [keyPair] = await db
    .select({ keyVersion: userKeyPairsTable.keyVersion, publicKey: userKeyPairsTable.publicKey })
    .from(userKeyPairsTable)
    .where(eq(userKeyPairsTable.userId, userId))
    .orderBy(desc(userKeyPairsTable.keyVersion))
    .limit(1);
  if (!keyPair) throw new Error("User has no keypair");
  return {
    sealedDeviceName: await sealAnonymous(
      keyPair.publicKey,
      fromString(deviceName),
      ACCOUNT_EVENT_DEVICE_AAD,
    ),
    deviceKeyVersion: keyPair.keyVersion,
    deviceNameHash: toBase64(await hashDeviceName(serverKey, userId, deviceName)),
  };
}

async function hasUsedDevice(userId: string, deviceNameHash: string): Promise<boolean> {
  const [seen] = await db
    .select({ id: accountEventsTable.id })
    .from(accountEventsTable)
    .where(
      and(
        eq(accountEventsTable.userId, userId),
        eq(accountEventsTable.deviceNameHash, deviceNameHash),
        inArray(accountEventsTable.type, KNOWN_DEVICE_TYPES),
      ),
    )
    .limit(1);
  return seen !== undefined;
}

/** Drop the user's events of one class (failures or the rest) past its count, in one statement. */
export async function pruneAccountEvents(userId: string, failures: boolean): Promise<void> {
  const sameClass = failures
    ? inArray(accountEventsTable.type, FAILURE_TYPES)
    : notInArray(accountEventsTable.type, FAILURE_TYPES);
  const oldestKept = db
    .select({ id: accountEventsTable.id })
    .from(accountEventsTable)
    .where(and(eq(accountEventsTable.userId, userId), sameClass))
    .orderBy(desc(accountEventsTable.id))
    .offset((failures ? ACCOUNT_FAILURES_MAX : ACCOUNT_EVENTS_MAX) - 1)
    .limit(1);
  await db
    .delete(accountEventsTable)
    .where(
      and(
        eq(accountEventsTable.userId, userId),
        sameClass,
        lt(accountEventsTable.id, sql`(${oldestKept})`),
      ),
    );
}

/** Delete every account's events past `ACCOUNT_EVENTS_MAX_AGE_MS` (the hourly purge). */
export async function purgeExpiredAccountEvents(now = Date.now()): Promise<number> {
  const purged = await db
    .delete(accountEventsTable)
    .where(lt(accountEventsTable.created_at, new Date(now - ACCOUNT_EVENTS_MAX_AGE_MS)))
    .returning({ id: accountEventsTable.id });
  return purged.length;
}

type ActionCtx = { userId: string; deviceName?: string; req?: { log?: EventLog } };

/** An action of a signed-in device, on its own account. */
export function recordAction(ctx: ActionCtx, type: AccountEventType): Promise<void> {
  return recordAccountEvent(ctx.userId, type, { deviceName: ctx.deviceName, log: ctx.req?.log });
}

/** One page of the user's events, newest first. */
export async function listAccountEvents(
  userId: string,
  before?: number,
): Promise<{ events: SealedAccountEvent[]; nextBefore: number | null }> {
  const rows = await db
    .select()
    .from(accountEventsTable)
    .where(
      and(
        eq(accountEventsTable.userId, userId),
        before === undefined ? undefined : lt(accountEventsTable.id, before),
      ),
    )
    .orderBy(desc(accountEventsTable.id))
    .limit(ACCOUNT_EVENTS_PAGE_SIZE + 1);

  const page = rows.slice(0, ACCOUNT_EVENTS_PAGE_SIZE);
  return {
    events: page.map((row) => ({
      id: row.id,
      type: row.type,
      sealedDeviceName: row.sealedDeviceName,
      deviceKeyVersion: row.deviceKeyVersion,
      newDevice: row.newDevice,
      createdAt: row.created_at.getTime(),
    })),
    nextBefore: rows.length > ACCOUNT_EVENTS_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
  };
}
