import { describe, expect, it } from "vitest";
import { BACKUP_REMINDER_INTERVAL_MS, isBackupReminderDue } from "../src/hooks/use-backup-reminder";

const CREATED = "2026-10-01T00:00:00.000Z";
const after = (at: string, ms: number) => new Date(Date.parse(at) + ms);

describe("isBackupReminderDue", () => {
  const local = { mode: "local" as const, createdAt: CREATED, lastExportAt: null };

  it("waits one interval after a local vault is created", () => {
    expect(isBackupReminderDue(local, null, after(CREATED, BACKUP_REMINDER_INTERVAL_MS - 1))).toBe(
      false,
    );
    expect(isBackupReminderDue(local, null, after(CREATED, BACKUP_REMINDER_INTERVAL_MS))).toBe(
      true,
    );
  });

  it("counts from the last export or snooze, whichever is later", () => {
    const exported = "2026-10-10T00:00:00.000Z";
    const snoozed = "2026-10-12T00:00:00.000Z";
    const entry = { ...local, lastExportAt: exported };

    expect(isBackupReminderDue(entry, null, after(exported, BACKUP_REMINDER_INTERVAL_MS))).toBe(
      true,
    );
    expect(isBackupReminderDue(entry, snoozed, after(exported, BACKUP_REMINDER_INTERVAL_MS))).toBe(
      false,
    );
    expect(isBackupReminderDue(entry, snoozed, after(snoozed, BACKUP_REMINDER_INTERVAL_MS))).toBe(
      true,
    );
  });

  it("never reminds a linked profile", () => {
    const linked = { ...local, mode: "linked" as const };
    expect(
      isBackupReminderDue(linked, null, after(CREATED, 10 * BACKUP_REMINDER_INTERVAL_MS)),
    ).toBe(false);
  });

  it("ignores an unreadable snooze date", () => {
    expect(
      isBackupReminderDue(local, "not a date", after(CREATED, BACKUP_REMINDER_INTERVAL_MS)),
    ).toBe(true);
  });

  it("ignores a snooze in the future (a clock that was ahead)", () => {
    const now = after(CREATED, BACKUP_REMINDER_INTERVAL_MS);
    const future = after(CREATED, 3 * BACKUP_REMINDER_INTERVAL_MS).toISOString();
    expect(isBackupReminderDue(local, future, now)).toBe(true);
  });
});
