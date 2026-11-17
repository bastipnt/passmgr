import { db, deviceCredentialsTable } from "@repo/db";
import { and, eq, lt, ne } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export async function deleteDeviceCredentials(userId: string, exceptId?: string, tx: Tx = db) {
  await tx
    .delete(deviceCredentialsTable)
    .where(
      and(
        eq(deviceCredentialsTable.userId, userId),
        exceptId ? ne(deviceCredentialsTable.credentialId, exceptId) : undefined,
      ),
    );
}

export async function ownsDeviceCredential(userId: string, credentialId: string) {
  const found = await db.query.deviceCredentialsTable.findFirst({
    columns: { credentialId: true },
    where: { credentialId, userId },
  });
  return found !== undefined;
}

/** Renew the credential up to `verifiedAt` (the session's password login), never backwards. */
export async function refreshDeviceCredential(
  userId: string,
  credentialId: string,
  verifiedAt: Date,
) {
  await db
    .update(deviceCredentialsTable)
    .set({ passwordVerifiedAt: verifiedAt })
    .where(
      and(
        eq(deviceCredentialsTable.userId, userId),
        eq(deviceCredentialsTable.credentialId, credentialId),
        lt(deviceCredentialsTable.passwordVerifiedAt, verifiedAt),
      ),
    );
}

export async function deleteDeviceCredential(userId: string, credentialId: string) {
  const deleted = await db
    .delete(deviceCredentialsTable)
    .where(
      and(
        eq(deviceCredentialsTable.userId, userId),
        eq(deviceCredentialsTable.credentialId, credentialId),
      ),
    )
    .returning({ credentialId: deviceCredentialsTable.credentialId });
  return deleted.length > 0;
}
