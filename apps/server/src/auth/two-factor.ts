import {
  decryptXChaCha,
  encryptXChaCha,
  generateTotpSecret,
  hkdf,
  OPAQUE_SERVER_IDENTITY,
  signHmac,
  totpUri,
  verifyToken,
} from "@repo/crypto";
import { db, userBackupCodesTable, userTotpTable } from "@repo/db";
import { BACKUP_CODE_COUNT } from "@repo/schema";
import { toBase64 } from "@repo/util";
import { and, count, eq, isNull, lt, or } from "drizzle-orm";
import { serverKey } from "../opaque";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// TOTP secret at rest: XChaCha20 under HKDF(server key, "totp-secret"). Backup
// codes: HMAC under HKDF(server key, "backup-code"), so a database dump alone
// can't brute-force them offline.
let totpKey: Promise<Uint8Array> | undefined;
let backupCodeKey: Promise<Uint8Array> | undefined;
const getTotpKey = () => (totpKey ??= hkdf(serverKey, "totpSecret"));
const getBackupCodeKey = () => (backupCodeKey ??= hkdf(serverKey, "backupCode"));

// No 0/o, 1/l/i: backup codes get read off paper.
const BACKUP_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const BACKUP_CODE_LENGTH = 10;

/** A new backup code, "xxxxx-xxxxx" (~49 bits). */
function generateBackupCode(): string {
  const chars: string[] = [];
  // Rejection sampling: no modulo bias.
  const limit = 256 - (256 % BACKUP_CODE_ALPHABET.length);
  while (chars.length < BACKUP_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit && chars.length < BACKUP_CODE_LENGTH) {
        chars.push(BACKUP_CODE_ALPHABET[byte % BACKUP_CODE_ALPHABET.length]!);
      }
    }
  }
  const code = chars.join("");
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** What a backup code is compared as: lower case, without spaces or dashes. */
function normalizeBackupCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function hashBackupCode(code: string): Promise<string> {
  return toBase64(await signHmac(await getBackupCodeKey(), normalizeBackupCode(code)));
}

/** A new secret for `startTotpEnrollment` and its `otpauth://` URI (labelled with the email). */
export function newTotpEnrollment(email: string): { secret: string; uri: string } {
  const secret = generateTotpSecret();
  return { secret, uri: totpUri(secret, OPAQUE_SERVER_IDENTITY, email) };
}

/** Whether the user has two-factor on (a TOTP secret is stored). */
export async function hasTotp(userId: string): Promise<boolean> {
  const row = await db.query.userTotpTable.findFirst({
    columns: { userId: true },
    where: { userId },
  });
  return row !== undefined;
}

export async function twoFactorStatus(userId: string) {
  const enabled = await hasTotp(userId);
  if (!enabled) return { enabled, backupCodesLeft: 0 };
  const [row] = await db
    .select({ left: count() })
    .from(userBackupCodesTable)
    .where(and(eq(userBackupCodesTable.userId, userId), isNull(userBackupCodesTable.usedAt)));
  return { enabled, backupCodesLeft: row?.left ?? 0 };
}

/**
 * Check a second-factor code: a 6-digit TOTP code (once per time step: the
 * step is claimed with a compare-and-swap) or an unused backup code (marked
 * used). False for anything else, also when two-factor is off.
 */
export async function checkSecondFactor(userId: string, code: string): Promise<boolean> {
  const trimmed = code.replace(/\s/g, "");
  if (/^\d{6}$/.test(trimmed)) return await checkTotpCode(userId, trimmed);

  const used = await db
    .update(userBackupCodesTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(userBackupCodesTable.userId, userId),
        eq(userBackupCodesTable.codeHash, await hashBackupCode(trimmed)),
        isNull(userBackupCodesTable.usedAt),
      ),
    )
    .returning({ id: userBackupCodesTable.id });
  return used.length > 0;
}

async function checkTotpCode(userId: string, code: string): Promise<boolean> {
  const row = await db.query.userTotpTable.findFirst({ where: { userId } });
  if (!row) return false;

  const secret = new TextDecoder().decode(
    decryptXChaCha(await getTotpKey(), row.encryptedSecret, row.secretNonce),
  );
  const step = await verifyToken(secret, code, row.lastUsedStep);
  if (step === null) return false;

  // Two logins racing with the same code: only one moves the step.
  const claimed = await db
    .update(userTotpTable)
    .set({ lastUsedStep: step })
    .where(
      and(
        eq(userTotpTable.userId, userId),
        or(isNull(userTotpTable.lastUsedStep), lt(userTotpTable.lastUsedStep, step)),
      ),
    )
    .returning({ userId: userTotpTable.userId });
  return claimed.length > 0;
}

/** Replace the user's backup codes with new ones; returns them (shown once). */
async function writeBackupCodes(tx: Tx, userId: string): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  await tx.delete(userBackupCodesTable).where(eq(userBackupCodesTable.userId, userId));
  await tx
    .insert(userBackupCodesTable)
    .values(
      await Promise.all(
        codes.map(async (code) => ({ userId, codeHash: await hashBackupCode(code) })),
      ),
    );
  return codes;
}

/**
 * Turn two-factor on: store `secret` (its code for `step` was just checked,
 * so that step counts as used) and new backup codes. False when it's on
 * already.
 */
export async function enableTotp(
  userId: string,
  secret: string,
  step: number,
): Promise<string[] | undefined> {
  const [encryptedSecret, secretNonce] = encryptXChaCha(await getTotpKey(), secret);
  return await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(userTotpTable)
      .values({ userId, encryptedSecret, secretNonce, lastUsedStep: step })
      .onConflictDoNothing()
      .returning({ userId: userTotpTable.userId });
    if (inserted.length === 0) return undefined;
    return await writeBackupCodes(tx, userId);
  });
}

/** New backup codes in place of the old ones; undefined when two-factor is off. */
export async function regenerateBackupCodes(userId: string): Promise<string[] | undefined> {
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ userId: userTotpTable.userId })
      .from(userTotpTable)
      .where(eq(userTotpTable.userId, userId))
      .for("update");
    if (!row) return undefined;
    return await writeBackupCodes(tx, userId);
  });
}

/** Turn two-factor off: the secret and every backup code go. */
export async function disableTotp(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userTotpTable).where(eq(userTotpTable.userId, userId));
    await tx.delete(userBackupCodesTable).where(eq(userBackupCodesTable.userId, userId));
  });
}
