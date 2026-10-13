import { db, deviceCredentialsTable } from "@repo/db";
import { and, eq, ne } from "drizzle-orm";

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

export async function refreshDeviceCredential(userId: string, credentialId: string) {
  await db
    .update(deviceCredentialsTable)
    .set({ passwordVerifiedAt: new Date() })
    .where(
      and(
        eq(deviceCredentialsTable.userId, userId),
        eq(deviceCredentialsTable.credentialId, credentialId),
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
